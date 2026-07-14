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
    digestItemsSplit: 0,
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

      // ── Step 1: Relevance check + topic extraction ────────────────────────
      const relevanceMsg = await anthropic.messages.create({
        model: "claude-sonnet-5",
        max_tokens: 4096,
        system: `You are an editorial assistant for ${NICHE_DESCRIPTION}. Evaluate whether a raw Telegram message contains news worth turning into video topics for this niche.

Respond with valid JSON only. No markdown, no code fences, no prose outside the JSON.

SINGLE-STORY message (the whole message describes one news event):
Return a single object:
{"relevant":true,"title":"<concise topic title, ≤80 chars>","summary":"<2–3 sentence summary: what happened and why it matters for our niche>","tags":["tag1","tag2"],"suggested_date":"<ISO date the event occurred, e.g. 2026-07-14 — null if not determinable>"}

DIGEST message (contains multiple distinct, separately-numbered findings or sections, each a different story):
Return a bare JSON array — one object per distinct relevant story. Do NOT wrap the array in another object; the top-level response IS the array:
[
  {"relevant":true,"title":"...","summary":"...","tags":[...],"suggested_date":"..."},
  {"relevant":true,"title":"...","summary":"...","tags":[...],"suggested_date":"..."}
]
Only include findings relevant to our niche. Omit irrelevant findings entirely. Each item must be specific enough to stand alone as a single video topic — do not produce a meta-summary of the digest.

NOT RELEVANT (the entire message has nothing for our niche):
{"relevant":false,"reason":"<brief reason>"}`,
        messages: [
          {
            role: "user",
            content: `Evaluate this Telegram message. Is it one story, a digest of multiple distinct stories, or not relevant?\n\n${rawItem.message_text}`,
          },
        ],
      });

      const relevanceBlock = relevanceMsg.content.find(
        (b) => b.type === "text"
      );
      const parsed = JSON.parse(relevanceBlock.text);

      // Normalize to array.
      // - Array → digest path (model returned bare array per instructions)
      // - Single object → wrap in length-1 array; works for both relevant and not-relevant
      const candidates = Array.isArray(parsed) ? parsed : [parsed];

      // If the sole candidate is not-relevant, the whole message is irrelevant.
      if (candidates.length === 1 && candidates[0].relevant === false) {
        await supabase
          .from("raw_news_items")
          .update({ status: "ignored" })
          .eq("id", rawId);
        stats.ignoredNotRelevant++;
        stats.processed++;
        continue;
      }

      // Filter to only relevant candidates (guards against model accidentally
      // including a relevant:false object alongside relevant:true ones in an array).
      const relevantCandidates = candidates.filter((c) => c.relevant !== false);

      if (relevantCandidates.length > 1) {
        stats.digestItemsSplit++;
      }

      // ── Steps 2–4: per-candidate dedup + saturation + insert ─────────────
      for (const candidate of relevantCandidates) {
        // Step 2: Dedup check against recent topics.
        // recentTitles grows as candidates are accepted, so candidates from the
        // SAME digest message are also deduped against each other.
        let isDuplicate = false;

        if (recentTitles.length > 0) {
          const dedupMsg = await anthropic.messages.create({
            model: "claude-sonnet-5",
            max_tokens: 512,
            system:
              'You check whether a proposed new topic substantially overlaps with any recently added topics. Respond with valid JSON only — no prose, no fences: {"isDuplicate":true,"reason":"which topic it duplicates"} or {"isDuplicate":false}',
            messages: [
              {
                role: "user",
                content: `Proposed topic: "${candidate.title}"\n\nRecent topics (last 60 days):\n${recentTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}\n\nDoes the proposed topic cover the same news event or story as any of these? Consider substantial overlap in the underlying event, not just surface similarity in wording.`,
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
          stats.ignoredDuplicate++;
          continue;
        }

        // Step 3: Web search saturation check (non-blocking)
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
                content: `Search for recent coverage of: "${candidate.title}". How fresh is this story — breaking news or already widely covered?`,
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

        // Step 4: Insert into topics as pending_review
        const aiReasoning = [
          `Relevance: ${candidate.summary}`,
          saturationNote ? `Coverage check: ${saturationNote}` : null,
        ]
          .filter(Boolean)
          .join("\n\n");

        const originalDate =
          candidate.suggested_date ?? rawItem.posted_at.slice(0, 10);

        const { error: insertErr } = await supabase.from("topics").insert({
          title: candidate.title,
          summary: candidate.summary,
          tags: Array.isArray(candidate.tags) ? candidate.tags : [],
          status: "pending_review",
          source_raw_news_item_id: rawId,
          ai_reasoning: aiReasoning,
          original_date: originalDate,
        });

        if (insertErr) throw new Error(`DB insert failed: ${insertErr.message}`);

        // Add to the in-memory dedup list so later candidates from this same
        // digest, and later raw items in this batch, are checked against it.
        recentTitles.push(candidate.title);

        stats.createdTopics++;
      }

      // Mark the raw item processed once — after all its candidates are handled.
      // If an insertErr threw above, we never reach this line; the item stays
      // 'unprocessed' so it can be retried, and already-inserted candidates
      // from the same message will be caught as duplicates on retry.
      await supabase
        .from("raw_news_items")
        .update({ status: "processed" })
        .eq("id", rawId);

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
