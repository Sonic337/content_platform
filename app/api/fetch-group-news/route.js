import { createServerClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import bigInt from "big-integer";

export const maxDuration = 30;

// Safety cap: maximum messages fetched from Telegram per request.
// Prevents unbounded fetches on very high-volume groups.
const FETCH_LIMIT = 500;

// Time window: only keep messages newer than this many hours.
// The DB's ON CONFLICT DO NOTHING constraint handles deduplication —
// re-fetching messages already in raw_news_items never creates duplicate rows.
// This window is a separate, complementary bound: it controls how far back
// each button click looks, purely for performance and relevance (no point
// scanning week-old messages every time). Changing it to 24 would mean each
// fetch only considers the last 24h of messages; dedup still happens at the
// DB level regardless.
const FETCH_WINDOW_HOURS = 48;

// Build a JSON-safe payload from a GramJS message object.
// GramJS Message fields (from tl/custom/message.d.ts):
//   id: number       — the message ID
//   date: number     — unix timestamp in seconds
//   message: string  — the text content (MTProto field name; Bot API calls it "text")
// Entity id fields (tl/api.d.ts): type long = BigInteger — call .toString() to stay JSON-safe.
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
  client.setLogLevel("error");

  try {
    await client.connect();

    // ── Build the peer explicitly rather than passing a bare number to getEntity().
    //
    // GramJS's resolveId() (Utils.js) classifies bare positive integers as PeerUser,
    // so getEntity(5555873255) silently tries a user lookup and fails. Basic groups
    // require the "marked" negative format (-chatId) for auto-detection, OR an explicit
    // InputPeerChat construction. We use the explicit form to be unambiguous.
    //
    // Api.InputPeerChat type (from tl/api.d.ts):
    //   export class InputPeerChat extends VirtualClass<{ chatId: long }> {
    //     chatId: long;  // long = BigInteger from big-integer library
    //   }
    //
    // If TELEGRAM_GROUP_IDENTIFIER is ever changed to point at a Supergroup or Channel,
    // this needs to change to Api.InputPeerChannel({ channelId: bigInt(id), accessHash: ... }).
    // Channels require a valid accessHash (not available without first resolving the entity
    // via a string @username or from a dialog list). The easiest path for channels is to
    // pass the @username string directly to getMessages() instead of constructing InputPeer.
    const isNumeric = /^-?\d+$/.test(groupIdentifier);

    let peer;
    let chatId;

    if (isNumeric) {
      const numericId = parseInt(groupIdentifier, 10);
      chatId = Math.abs(numericId); // store the raw positive chatId

      // Construct explicit InputPeerChat for basic groups.
      // chatId must be a BigInteger (GramJS type long), not a plain JS number.
      peer = new Api.InputPeerChat({ chatId: bigInt(chatId) });
    } else {
      // @username or "groupname" string — GramJS can resolve these correctly
      // via getEntity() because string resolution goes through a different
      // code path (contacts.ResolvedPeer) that doesn't use resolveId().
      // This path also works for Channels/Supergroups identified by username.
      const entity = await client.getEntity(groupIdentifier);
      chatId = parseInt(entity.id.toString(), 10);
      peer = entity;
    }

    // Fetch up to FETCH_LIMIT recent messages from the group.
    const messages = await client.getMessages(peer, { limit: FETCH_LIMIT });

    // Apply the time-window filter client-side.
    const windowStart = Date.now() - FETCH_WINDOW_HOURS * 60 * 60 * 1000;
    const recentMessages = messages.filter(
      (msg) =>
        typeof msg.message === "string" &&
        msg.message.trim().length > 0 &&
        msg.date * 1000 >= windowStart
    );

    if (recentMessages.length === 0) {
      await client.disconnect();
      return NextResponse.json({
        ok: true,
        scanned: messages.length,
        withinWindow: 0,
        inserted: 0,
        skipped: 0,
      });
    }

    // Build the upsert payload.
    const upsertPayload = recentMessages.map((msg) => ({
      telegram_message_id: msg.id,
      telegram_chat_id: chatId,
      message_text: msg.message,
      posted_at: new Date(msg.date * 1000).toISOString(),
      raw_payload: safeMsgPayload(msg),
    }));

    // Batch upsert with ON CONFLICT (telegram_chat_id, telegram_message_id) DO NOTHING.
    // .select("id") uses RETURNING id: only actually-inserted rows are returned,
    // so data.length === inserted and (upsertPayload.length - data.length) === skipped.
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
      scanned: messages.length,
      withinWindow: recentMessages.length,
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
