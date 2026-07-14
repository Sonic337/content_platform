import { createServerClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 120;

const NICHE_DESCRIPTION =
  "an internal content-operations dashboard for a two-person AI content creator operation producing short-form and long-form video (TikTok, Instagram Reels, YouTube Shorts, X, LinkedIn) about AI tools, vibe-coding, and build-in-public";

export async function POST(request) {
  const { rawNewsItemIds } = await request.json();

  if (!Array.isArray(rawNewsItemIds) || rawNewsItemIds.length === 0) {
    return NextResponse.json(
      { error: "rawNewsItemIds must be a non-empty array" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const anthropic = new Anthropic();

  // Pre-fetch recent topics for dedup check (last 60 days)
  const sixtyDaysAgo = new Date(
    Date.now() - 60 * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data: recentTopics } = await supabase
    .from("topics")
    .select("title")
    .gte("date_added", sixtyDaysAgo);
  const recentTitles = (recentTopics || []).map((t) => t.title);

  const stats = {
    processed: 0,
    createdTopics: 0,
    ignoredDuplicate: 0,
    ignoredNotRelevant: 0,
    errors: [],
  };

  for (const rawId of rawNewsItemIds) {
    try {
      // Fetch the raw item — skip anything that isn't 'unprocessed'
      const { data: rawItem, error: fetchErr } = await supabase
        .from("raw_news_items")
        .select("id, message_text, posted_at")
        .eq("id", rawId)
        .eq("status", "unprocessed")
        .single();

      if (fetchErr || !rawItem) continue;

      // ── Step 1: Relevance check ──────────────────────────────────────────
      const relevanceMsg = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system: `You are an editorial assistant for ${NICHE_DESCRIPTION}. Evaluate whether a raw Telegram message contains a news item worth turning into a video topic for this niche.

Respond with valid JSON only. No markdown, no code fences, no prose outside the JSON.

If the message is relevant:
{"relevant":true,"title":"<concise topic title, ≤80 chars>","summary":"<2–3 sentence summary: what happened and why it matters for our niche>","tags":["tag1","tag2"],"suggested_date":"<ISO date the event occurred, e.g. 2026-07-14, inferred from the message text — null if it cannot be reasonably inferred>"}

If the message is not relevant:
{"relevant":false,"reason":"<brief reason>"}`,
        messages: [
          {
            role: "user",
            content: `Evaluate this Telegram message for relevance to our AI tools / vibe-coding / build-in-public content niche:\n\n${rawItem.message_text}`,
          },
        ],
      });

      const relevanceBlock = relevanceMsg.content.find(
        (b) => b.type === "text"
      );
      const relevance = JSON.parse(relevanceBlock.text);

      if (!relevance.relevant) {
        await supabase
          .from("raw_news_items")
          .update({ status: "ignored" })
          .eq("id", rawId);
        stats.ignoredNotRelevant++;
        stats.processed++;
        continue;
      }

      // ── Step 2: Dedup check against recent topics ────────────────────────
      let isDuplicate = false;

      if (recentTitles.length > 0) {
        const dedupMsg = await anthropic.messages.create({
          model: "claude-sonnet-5",
          max_tokens: 512,
          system:
            "You check whether a proposed new topic substantially overlaps with any recently added topics. Respond with valid JSON only — no prose, no fences: {\"isDuplicate\":true,\"reason\":\"which topic it duplicates\"} or {\"isDuplicate\":false}",
          messages: [
            {
              role: "user",
              content: `Proposed topic: "${relevance.title}"\n\nRecent topics (last 60 days):\n${recentTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nDoes the proposed topic cover the same news event or story as any of these? Consider substantial overlap in the underlying event, not just surface similarity in wording.`,
            },
          ],
        });

        const dedupBlock = dedupMsg.content.find((b) => b.type === "text");
        const dedup = JSON.parse(dedupBlock.text);

        if (dedup.isDuplicate) {
          isDuplicate = true;
        }
      }

      if (isDuplicate) {
        await supabase
          .from("raw_news_items")
          .update({ status: "ignored" })
          .eq("id", rawId);
        stats.ignoredDuplicate++;
        stats.processed++;
        continue;
      }

      // ── Step 3: Web search saturation check (non-blocking) ───────────────
      let saturationNote = "";
      try {
        const searchMsg = await anthropic.messages.create({
          model: "claude-sonnet-5",
          max_tokens: 2048,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          system:
            "You are checking how fresh a piece of news is. After searching, write 1–2 sentences: is this breaking news from the last day or two, or has it been widely covered for longer? Be specific about recency.",
          messages: [
            {
              role: "user",
              content: `Search for recent coverage of: "${relevance.title}". How fresh is this story — breaking news or already widely covered?`,
            },
          ],
        });

        const searchBlock = searchMsg.content.find((b) => b.type === "text");
        if (searchBlock) {
          saturationNote = searchBlock.text.trim();
        }
      } catch {
        saturationNote = "Web search unavailable for this item.";
      }

      // ── Step 4: Insert into topics as pending_review ─────────────────────
      const aiReasoning = [
        `Relevance: ${relevance.summary}`,
        saturationNote ? `Coverage check: ${saturationNote}` : null,
      ]
        .filter(Boolean)
        .join("\n\n");

      const originalDate =
        relevance.suggested_date ??
        rawItem.posted_at.slice(0, 10); // ISO date fallback from posted_at

      const { error: insertErr } = await supabase.from("topics").insert({
        title: relevance.title,
        summary: relevance.summary,
        tags: Array.isArray(relevance.tags) ? relevance.tags : [],
        status: "pending_review",
        source_raw_news_item_id: rawId,
        ai_reasoning: aiReasoning,
        original_date: originalDate,
      });

      if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

      // Add to the in-memory dedup list so later items in this batch see it
      recentTitles.push(relevance.title);

      await supabase
        .from("raw_news_items")
        .update({ status: "processed" })
        .eq("id", rawId);

      stats.createdTopics++;
      stats.processed++;
    } catch (err) {
      stats.errors.push({ id: rawId, error: err.message ?? String(err) });
    }
  }

  return NextResponse.json(stats);
}

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 });
}
