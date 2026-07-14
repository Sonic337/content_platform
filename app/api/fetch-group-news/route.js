import { createServerClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

export const maxDuration = 30;

const MESSAGE_LIMIT = 100;

// Build a JSON-safe payload from a GramJS message object.
// GramJS Message fields are typed as follows (from tl/custom/message.d.ts):
//   id: number       — the message ID
//   date: number     — unix timestamp in seconds
//   message: string  — the text content ("message" is the MTProto field name; the Bot API calls it "text")
// Entity id fields (from tl/api.d.ts) are BigInteger (type long = BigInteger),
// so we call .toString() on them to stay JSON-safe.
function safeMsgPayload(msg) {
  return {
    _source: "gramjs",
    id: msg.id,
    date: msg.date,
    message: msg.message,
    views: msg.views ?? null,
    forwards: msg.forwards ?? null,
    editDate: msg.editDate ?? null,
    out: msg.out ?? null,
    mentioned: msg.mentioned ?? null,
    post: msg.post ?? null,
    fromId: msg.fromId
      ? {
          className: msg.fromId.className,
          userId: msg.fromId.userId?.toString() ?? null,
        }
      : null,
    peerId: msg.peerId
      ? {
          className: msg.peerId.className,
          channelId: msg.peerId.channelId?.toString() ?? null,
          chatId: msg.peerId.chatId?.toString() ?? null,
          userId: msg.peerId.userId?.toString() ?? null,
        }
      : null,
  };
}

export async function POST() {
  const apiId = Number(process.env.TELEGRAM_API_ID);
  const apiHash = process.env.TELEGRAM_API_HASH;
  const sessionStr = process.env.TELEGRAM_USER_SESSION;
  const groupIdentifier = process.env.TELEGRAM_GROUP_IDENTIFIER;

  if (!apiId || !apiHash || !sessionStr || !groupIdentifier) {
    return NextResponse.json(
      { error: "Missing required env vars: TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_USER_SESSION, TELEGRAM_GROUP_IDENTIFIER" },
      { status: 500 }
    );
  }

  const client = new TelegramClient(
    new StringSession(sessionStr),
    apiId,
    apiHash,
    { connectionRetries: 2 }
  );
  // Suppress verbose MTProto logs in server output.
  client.setLogLevel("error");

  try {
    // Connect using the saved session — no interactive login needed.
    await client.connect();

    // Resolve the group entity. TELEGRAM_GROUP_IDENTIFIER can be either
    // a numeric chat ID (e.g. "1234567890") or a @username string.
    const entityRef = /^-?\d+$/.test(groupIdentifier)
      ? parseInt(groupIdentifier, 10)
      : groupIdentifier;

    const entity = await client.getEntity(entityRef);

    // entity.id is a BigInteger (GramJS type `long` = BigInteger from big-integer library).
    // Telegram group/channel IDs are well within JS safe-integer range, so Number() is safe.
    const chatId = parseInt(entity.id.toString(), 10);

    // Fetch the last MESSAGE_LIMIT messages from the group.
    const messages = await client.getMessages(entity, { limit: MESSAGE_LIMIT });

    // Filter to text-only messages (msg.message is the text field in GramJS's MTProto naming).
    const textMessages = messages.filter(
      (msg) => typeof msg.message === "string" && msg.message.trim().length > 0
    );

    if (textMessages.length === 0) {
      await client.disconnect();
      return NextResponse.json({ ok: true, fetched: messages.length, inserted: 0, skipped: 0 });
    }

    // Build the insert payload.
    const upsertPayload = textMessages.map((msg) => ({
      telegram_message_id: msg.id,
      telegram_chat_id: chatId,
      message_text: msg.message,
      posted_at: new Date(msg.date * 1000).toISOString(),
      raw_payload: safeMsgPayload(msg),
    }));

    // Batch upsert with ON CONFLICT (telegram_chat_id, telegram_message_id) DO NOTHING.
    // .select("id") makes PostgreSQL return RETURNING id — only actually-inserted rows
    // are returned when ignoreDuplicates:true fires DO NOTHING on conflicts.
    // So data.length === inserted count; (upsertPayload.length - data.length) === skipped.
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("raw_news_items")
      .upsert(upsertPayload, {
        onConflict: "telegram_chat_id,telegram_message_id",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      console.error("[fetch-group-news] FAILED — DB upsert error:", error);
      await client.disconnect();
      return NextResponse.json({ error: `DB error: ${error.message}` }, { status: 500 });
    }

    const inserted = Array.isArray(data) ? data.length : 0;
    const skipped = upsertPayload.length - inserted;

    await client.disconnect();

    return NextResponse.json({
      ok: true,
      fetched: messages.length,
      inserted,
      skipped,
    });
  } catch (err) {
    console.error("[fetch-group-news] FAILED:", err);
    try { await client.disconnect(); } catch {}
    return NextResponse.json(
      { error: err.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
