import { createServerClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// 300 s is Vercel's hard ceiling for serverless functions on Pro; raising it further has no effect.
export const maxDuration = 300;

const NICHE_DESCRIPTION =
  "an internal content-operations dashboard for a two-person AI content creator operation producing short-form and long-form video (TikTok, Instagram Reels, YouTube Shorts, X, LinkedIn) about AI tools, vibe-coding, and build-in-public";

// Kept in sync with skills/content-review.md — update both if changing.
// Inlined rather than read from disk: Vercel's serverless bundler uses output
// file tracing and only includes files statically reachable via import/require.
// A readFileSync on an arbitrary relative path is not traced and the file would
// be absent at runtime in production.
const CONTENT_REVIEW_SKILL = `# Content Review Skill

Purpose: decide whether a raw news item (or a single finding within a digest) is worth turning into a video for this niche — AI tools, vibe-coding, build-in-public, AI SaaS — and, if so, how strong a candidate it is.

## Scoring: 1–10, integer

Score across four weighted dimensions, then combine:

### 1. Specificity (0–3 points)
- 3: Names a specific tool/company/product/statistic/event with a clear "what happened."
- 2: Names a specific thing but the "what happened" is vague or implied.
- 1: General trend or theme, no single anchor entity/event.
- 0: Pure sentiment/mood observation with no concrete anchor at all.

### 2. Niche fit (0–3 points)
- 3: Directly about AI tools, vibe-coding, build-in-public, or AI SaaS — the exact niche.
- 2: Adjacent (general AI industry news, developer tooling) — relevant but not a bullseye.
- 1: Tangentially related (mentions AI in passing, broader tech).
- 0: Off-niche entirely.

### 3. Freshness / saturation (0–2 points)
- 2: Breaking or recent (last few days), limited existing coverage.
- 1: Established but still actively discussed (weeks old).
- 0: Old, widely covered, unlikely to feel new to an audience (months old, saturated across many outlets).

### 4. Actionability for content (0–2 points)
- 2: Obvious video angle exists (a demo, a reaction, a breakdown, a build-along).
- 1: Could be covered but requires more creative framing to make interesting.
- 0: Hard to imagine a compelling video from this alone.

**Total: sum of all four (max 10).**

## Threshold
- Score ≥ 6: PASS — becomes a topic candidate, status pending_review.
- Score 4–5: BORDERLINE — becomes a topic candidate but flagged distinctly so a human reviewer knows it's a weaker pick.
- Score ≤ 3: FAIL — discarded, raw item marked ignored, never becomes a topic.

## What does NOT count as a content piece
- Status/log messages from cron jobs themselves ("Working — 3 min", "Ran one test fire now") — score these 0 automatically, do not run full scoring.
- Pure conversational exchanges between the user and the bot ("Can you run this now?") — same, automatic 0.
- Self-improvement/meta messages about the bot's own configuration ("Patched SKILL.md in skill...") — automatic 0.

## Digest handling
When a single message contains multiple numbered findings, apply this scoring independently to EACH finding, not to the message as a whole. The message's overall framing/genre (digest, brief, trend report) has no bearing on any individual finding's score.`;

// Stop starting new items after this many ms — leaves a 30 s buffer before
// Vercel's 300 s kill so the in-flight item and the response write can finish.
const BUDGET_MS = 200_000;

export async function POST(request) {
  const startTime = Date.now();
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
    stoppedEarly: false,
    remainingUnprocessedCount: 0,
  };

  for (const rawId of rawNewsItemIds) {
    // Check time budget before starting a new item's API calls.
    // An in-flight item can still finish; this only prevents starting new ones.
    if (Date.now() - startTime > BUDGET_MS) {
      stats.stoppedEarly = true;
      // Count how many of the remaining IDs are still unprocessed in the DB.
      const remaining = rawNewsItemIds.slice(rawNewsItemIds.indexOf(rawId));
      const { count } = await supabase
        .from("raw_news_items")
        .select("id", { count: "exact", head: true })
        .in("id", remaining)
        .eq("status", "unprocessed");
      stats.remainingUnprocessedCount = count ?? 0;
      break;
    }

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
        system: `You are an editorial assistant for ${NICHE_DESCRIPTION}. Your job is to extract usable video topic candidates from a Telegram message and score each one.

Respond with valid JSON only. No markdown, no code fences, no prose outside the JSON.

${CONTENT_REVIEW_SKILL}

Note on Freshness scoring: you do not have web search access at this stage. Estimate Freshness from dates mentioned in the message, how recently the described events appear to have occurred, and your training knowledge. A coverage check will follow separately and will appear in the reviewer notes.

─── STEP 1: STRUCTURE CHECK (do this first, before any scoring) ───

Does the message contain multiple distinct numbered findings, bullet points, or clearly delineated separate items (e.g. "1. ...", "2. ...", or "What dominated X:", "What dominated Reddit:", etc.)? This includes digest briefs, cron reports, trend summaries, and any other format with numbered or sectioned entries — the genre label does not matter, only the presence of discrete enumerable items.

IF YES → this is a MULTI-ITEM message. Go to STEP 2.
IF NO  → this is a SINGLE-ITEM message. Go to STEP 3.

─── STEP 2: MULTI-ITEM path ───

Score EACH numbered finding or discrete item INDEPENDENTLY using the Content Review Skill rubric above. The overall framing of the message (e.g. "meta-analysis", "trend brief", "sentiment digest") is IRRELEVANT to any individual finding's score.

Apply the threshold to each finding:
- Score ≥ 6 → PASS: include in output
- Score 4–5 → BORDERLINE: include in output with "borderline":true
- Score ≤ 3 → FAIL: omit silently

Return a bare JSON array (the top-level response IS the array — do NOT wrap it in an object):
[
  {"relevant":true,"title":"<concise title for this finding, ≤80 chars>","summary":"<2–3 sentences: what specifically happened/was observed and why it matters for our niche>","tags":["tag1","tag2"],"suggested_date":"<ISO date of the event/observation, e.g. 2026-07-14 — null if not determinable>","score":7,"score_breakdown":"Specificity: 3, Niche fit: 2, Freshness: 1, Actionability: 1"},
  {"relevant":true,"borderline":true,"title":"...","summary":"...","tags":[...],"suggested_date":"...","score":5,"score_breakdown":"Specificity: 2, Niche fit: 2, Freshness: 0, Actionability: 1"}
]

If NO findings score ≥ 4, return an empty array: []

─── STEP 3: SINGLE-ITEM path ───

Score this message using the Content Review Skill rubric above. Then:

If score ≥ 6:
{"relevant":true,"title":"<concise title, ≤80 chars>","summary":"<2–3 sentences: what happened and why it matters for our niche>","tags":["tag1","tag2"],"suggested_date":"<ISO date — null if not determinable>","score":N,"score_breakdown":"Specificity: X, Niche fit: X, Freshness: X, Actionability: X"}

If score 4–5:
{"relevant":true,"borderline":true,"title":"<concise title, ≤80 chars>","summary":"<2–3 sentences>","tags":["tag1","tag2"],"suggested_date":"<ISO date — null if not determinable>","score":N,"score_breakdown":"Specificity: X, Niche fit: X, Freshness: X, Actionability: X"}

If score ≤ 3:
{"relevant":false,"reason":"<brief reason including score and why it failed>"}`,
        messages: [
          {
            role: "user",
            content: `Extract video topic candidates from this Telegram message:\n\n${rawItem.message_text}`,
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
            max_tokens: 4096,
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

          const saturationText = searchMsg.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join(" ")
            .trim();
          if (saturationText) {
            saturationNote = saturationText;
          }
        } catch {
          saturationNote = "Web search unavailable for this item.";
        }

        // Step 4: Insert into topics as pending_review
        const scorePrefix =
          candidate.score != null
            ? `Score: ${candidate.score}/10 (${candidate.score_breakdown})${candidate.borderline ? " [BORDERLINE]" : ""}`
            : null;

        const aiReasoning = [
          scorePrefix,
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

      console.log(`[analyze-news] item completed in ${Date.now() - startTime}ms (cumulative elapsed, id: ${rawId})`);
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
