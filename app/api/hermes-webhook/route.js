import { createServerClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";

export async function POST(req) {
  // ── Auth: verify Telegram webhook secret ──────────────────────────────────
  const incomingSecret = req.headers.get("x-telegram-bot-api-secret-token");
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!incomingSecret || incomingSecret !== expectedSecret) {
    console.warn("[hermes-webhook] Secret mismatch or missing header — rejecting request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  let update;
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Skip non-text updates (photos, stickers, edits, etc.) ─────────────────
  // Always return 200 for handled-but-skipped updates so Telegram doesn't retry.
  const message = update?.message;
  if (!message || typeof message.text !== "string") {
    return NextResponse.json({ ok: true, inserted: false });
  }

  // ── Insert into staging table ──────────────────────────────────────────────
  const supabase = createServerClient();

  const payload = {
    telegram_message_id: message.message_id,
    telegram_chat_id:    message.chat.id,
    message_text:        message.text,
    posted_at:           new Date(message.date * 1000).toISOString(),
    raw_payload:         update,
  };

  try {
    // ON CONFLICT (telegram_chat_id, telegram_message_id) DO NOTHING
    // .select("id") lets us detect duplicates: empty array = conflict, one row = inserted.
    const { data, error } = await supabase
      .from("raw_news_items")
      .upsert(payload, {
        onConflict: "telegram_chat_id,telegram_message_id",
        ignoreDuplicates: true,
      })
      .select("id");

    if (error) {
      console.error("[hermes-webhook] DB INSERT FAILED", error);
      // Return 200 so Telegram doesn't hammer retries on our bug.
      return NextResponse.json({ ok: true, inserted: false });
    }

    const inserted = Array.isArray(data) && data.length > 0;
    return NextResponse.json({ ok: true, inserted });
  } catch (err) {
    console.error("[hermes-webhook] DB INSERT FAILED (unexpected)", err);
    return NextResponse.json({ ok: true, inserted: false });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
