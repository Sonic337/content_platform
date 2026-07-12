import Anthropic from "@anthropic-ai/sdk";
import { fal } from "@fal-ai/client";
import { createServerClient } from "@/lib/supabaseServer";

export const maxDuration = 120;

const PLATFORM_KEYWORDS = {
  tiktok: "tiktok",
  instagram_reels: "instagram",
  youtube_shorts: "youtube",
  x: " x ",
  linkedin: "linkedin",
};

const VERTICAL_PLATFORMS = ["tiktok", "instagram_reels", "youtube_shorts"];

const DEFAULT_DURATION = { vertical: 30, horizontal: 60 };

const STOPWORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with","by",
  "from","as","is","was","are","were","be","been","have","has","had","do",
  "does","did","will","would","could","should","may","might","must","can",
  "this","that","these","those","i","you","he","she","it","we","they","my",
  "your","his","her","its","our","their","what","which","who","when","where",
  "why","how","not","no","so","just","about","if","then","there","here",
  "all","any","one","two","also","more","some","than","very","up","out",
  "now","even","new","us","get","got","like","use","make","well","going",
  "into","over","after","before","been","still","only","while","other",
]);

function getPlatformKeyword(platform) {
  return PLATFORM_KEYWORDS[platform] ?? platform;
}

function extractKeywords(text) {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[\s\W]+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    ),
  ];
}

function scoreByKeywords(searchText, keywords) {
  const lower = (searchText || "").toLowerCase();
  return keywords.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);
}

const EXCLUDED_TIERS_DEFAULT = ["NOT CONFIRMED", "REFUTED"];

async function fetchHooks(supabase, target_platform, keywords, includeUnverified = false) {
  const kw = getPlatformKeyword(target_platform);

  let platformQuery = supabase
    .from("hooks")
    .select("id, hook_text, platform, evidence_tier, category_pattern, mechanism, notes")
    .ilike("platform", `%${kw}%`)
    .order("id", { ascending: false })
    .limit(40);

  if (!includeUnverified) {
    platformQuery = platformQuery.not(
      "evidence_tier",
      "in",
      `("${EXCLUDED_TIERS_DEFAULT.join('","')}")`
    );
  }

  const { data: platformPool } = await platformQuery;

  const rank = (rows) =>
    (rows || [])
      .map((h) => ({
        ...h,
        _score: scoreByKeywords(
          [h.category_pattern, h.hook_text, h.mechanism, h.notes].join(" "),
          keywords
        ),
        _verified: (h.evidence_tier || "").toUpperCase().includes("VERIFIED") ? 1 : 0,
      }))
      .sort((a, b) => b._score - a._score || b._verified - a._verified);

  const ranked = rank(platformPool);
  const selected = ranked.slice(0, 5);

  if (selected.length < 5) {
    const usedIds = new Set(selected.map((h) => h.id));
    const needed = 5 - selected.length;

    const { data: anyPool } = await supabase
      .from("hooks")
      .select("id, hook_text, platform, evidence_tier, category_pattern, mechanism, notes")
      .ilike("evidence_tier", "%VERIFIED%")
      .order("id", { ascending: false })
      .limit(needed + 30);

    const backfill = rank(anyPool)
      .filter((h) => !usedIds.has(h.id))
      .slice(0, needed);

    selected.push(...backfill);
  }

  return selected;
}

async function fetchCorpus(supabase, target_platform, keywords) {
  const { data: pool } = await supabase
    .from("corpus")
    .select("id, title, body_text, platform_published, date_published, tags")
    .ilike("platform_published", `%${getPlatformKeyword(target_platform)}%`)
    .order("date_published", { ascending: false })
    .limit(20);

  const scored = (pool || []).map((c) => ({
    ...c,
    _score: scoreByKeywords(
      [c.title, ...(Array.isArray(c.tags) ? c.tags : [])].join(" "),
      keywords
    ),
  }));

  // Only re-sort by relevance if at least one row scored; otherwise keep recency order
  if (scored.some((c) => c._score > 0)) {
    scored.sort((a, b) => b._score - a._score);
  }

  return scored.slice(0, 3);
}

async function fetchVisualPatterns(supabase, target_platform, keywords) {
  const kw = getPlatformKeyword(target_platform);

  const { data: pool } = await supabase
    .from("visual_patterns")
    .select("id, pattern_text, platform, category_pattern")
    .ilike("platform", `%${kw}%`)
    .order("id", { ascending: false })
    .limit(20);

  if (!pool || pool.length === 0) return [];

  const scored = pool.map((p) => ({
    ...p,
    _score: scoreByKeywords(
      [p.pattern_text, p.category_pattern].join(" "),
      keywords
    ),
  }));

  if (scored.some((p) => p._score > 0)) {
    scored.sort((a, b) => b._score - a._score);
  }

  return scored.slice(0, 5);
}

function buildSystemPrompt(hooks, corpus, visualPatterns, targetDurationSec) {
  const hookBlock = hooks
    .map(
      (h, i) =>
        `${i + 1}. [${h.evidence_tier ?? "unknown tier"}] ${h.hook_text} (platform: ${h.platform}, category: ${h.category_pattern})`
    )
    .join("\n");

  const corpusBlock = corpus
    .map(
      (c, i) =>
        `--- Sample ${i + 1} (${c.platform_published}, ${c.date_published ?? "n/a"}) ---\n${c.body_text ?? c.title}`
    )
    .join("\n\n");

  const visualBlock =
    visualPatterns.length > 0
      ? `\nVISUAL PATTERNS (proven thumbnail/visual direction for this platform and topic area — shape the thumbnail description and script visual cues around one of these if relevant):\n${visualPatterns
          .map((p, i) => `${i + 1}. [${p.category_pattern ?? "general"}] ${p.pattern_text}`)
          .join("\n")}\n`
      : "";

  const durationLine = targetDurationSec
    ? `- script_segments must sum to approximately ${targetDurationSec} seconds total.`
    : `- script_segments should cover ~30-60s total for vertical platforms (TikTok, Reels, Shorts) or ~60-90s for horizontal (X, LinkedIn).`;

  return `You are a content strategist producing a short-form video script and hook options.

HOOK BANK (verified/sourced hooks from the research database — adapt these to the topic):
${hookBlock}

VOICE & STYLE REFERENCE (corpus samples — match this voice exactly):
${corpusBlock}${visualBlock}

INSTRUCTIONS:
- Produce script_segments: a list of timed beats covering the full video runtime.
  ${durationLine}
  Each beat should be short enough to match one visual/edit cut — a few sentences at most, not a paragraph.
- The FIRST segment (label "hook") must read like one of the grounding hook examples above: punchy, direct, no generic intro. It IS the hook.
- Beat labels should reflect their role: hook, context, proof, pivot, cta, etc.
- Produce 4-5 hook_options: a mix of bank hooks adapted to this specific topic (source: "bank") and 1-2 newly generated hooks in the same voice as the corpus (source: "generated").
  For bank hooks, include bank_index: the 1-based number of the hook from the HOOK BANK list above (e.g. bank_index: 2 if you adapted hook #2). For generated hooks omit bank_index entirely.
- Produce exactly 3 title_options.
- Return ONLY a JSON object with this exact shape — no prose, no markdown, no code fences:
{"script_segments":[{"start_sec":0,"end_sec":5,"label":"hook","text":"..."},{"start_sec":5,"end_sec":12,"label":"context","text":"..."}],"hook_options":[{"hook_text":"...","source":"bank","bank_index":1},{"hook_text":"...","source":"generated"}],"title_options":["...","...","..."]}`;
}

async function callAnthropic(systemPrompt, input_text, target_platform) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Target platform: ${target_platform}\n\nTopic / news text:\n${input_text}`,
      },
    ],
  });

  console.log("[generate] stop_reason:", msg.stop_reason);
  console.log("[generate] content block types:", msg.content.map((b) => b.type));
  console.log("[generate] full content:", JSON.stringify(msg.content, null, 2));

  const textBlock = msg.content.find((b) => b.type === "text");
  const rawText = textBlock?.text ?? "";
  return rawText;
}

function parseAnthropicResponse(raw) {
  console.log("[generate] Anthropic raw response:\n", raw);
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    console.error("[generate] JSON parse failed:", err.message);
    console.error("[generate] Raw text that failed to parse:", raw);
    throw err;
  }
}

async function generateThumbnail(thumbnail_prompt, target_platform) {
  fal.config({ credentials: process.env.FAL_KEY });

  const result = await fal.subscribe("fal-ai/flux/dev", {
    input: {
      prompt: thumbnail_prompt,
      image_size: VERTICAL_PLATFORMS.includes(target_platform)
        ? "portrait_16_9"
        : "landscape_16_9",
    },
  });

  return result.data.images[0].url;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { input_text, target_platform, topic_id, target_duration_sec, include_unverified } = body;

  if (!input_text || !target_platform) {
    return Response.json(
      { error: "input_text and target_platform are required" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Extract keywords from input for relevance ranking
  const keywords = extractKeywords(input_text);

  // Fetch all grounding data in parallel
  // include_unverified: when true, NOT CONFIRMED and REFUTED hooks are included in suggestions
  const [hooks, corpus, visualPatterns] = await Promise.all([
    fetchHooks(supabase, target_platform, keywords, include_unverified === true),
    fetchCorpus(supabase, target_platform, keywords),
    fetchVisualPatterns(supabase, target_platform, keywords),
  ]);

  // Call Anthropic
  let rawResponse;
  try {
    const systemPrompt = buildSystemPrompt(hooks, corpus, visualPatterns, target_duration_sec ?? null);
    rawResponse = await callAnthropic(systemPrompt, input_text, target_platform);
  } catch (err) {
    return Response.json(
      { error: `Anthropic API call failed: ${err.message}` },
      { status: 502 }
    );
  }

  // Parse — separate try/catch so parse errors surface clearly
  let aiResult;
  try {
    aiResult = parseAnthropicResponse(rawResponse);
  } catch (err) {
    return Response.json(
      { error: "Failed to parse generation response", parseError: err.message, rawResponse },
      { status: 500 }
    );
  }

  const { script_segments, title_options } = aiResult;

  // Resolve bank_index → evidence_tier for bank-sourced hooks, then strip bank_index
  const hook_options = (aiResult.hook_options || []).map((h) => {
    if (h.source === "bank" && typeof h.bank_index === "number") {
      const source_hook = hooks[h.bank_index - 1];
      const { bank_index, ...rest } = h;
      return { ...rest, evidence_tier: source_hook?.evidence_tier ?? null };
    }
    // generated hooks: ensure no bank_index leaks through, evidence_tier omitted
    const { bank_index, ...rest } = h;
    return rest;
  });

  // Guard: do not insert a row with empty generation data
  if (!script_segments || !aiResult.hook_options || !title_options) {
    console.error("[generate] Parsed result missing required fields:", aiResult);
    return Response.json(
      {
        error: "Failed to parse generation response",
        detail: "script_segments, hook_options, or title_options missing after parse",
        parsed: aiResult,
        rawResponse,
      },
      { status: 500 }
    );
  }

  // Derive plain-text script as fallback/search field
  const script = Array.isArray(script_segments)
    ? script_segments.map((s) => s.text).join("\n")
    : "";

  // Build thumbnail prompt — incorporate top visual pattern if available
  const topTitle = title_options[0] ?? input_text.slice(0, 80);
  const openingBeat = script_segments[0]?.text ?? "";
  const visualCue =
    visualPatterns.length > 0
      ? ` Visual style: ${visualPatterns[0].pattern_text?.slice(0, 100)}.`
      : " Cinematic, high-contrast, bold typography style.";
  const thumbnail_prompt = `${topTitle}. ${openingBeat.slice(0, 120)}.${visualCue}`;

  // Generate thumbnail — non-fatal
  let thumbnail_url = null;
  try {
    thumbnail_url = await generateThumbnail(thumbnail_prompt, target_platform);
  } catch (err) {
    console.warn("[generate] Thumbnail generation failed (non-fatal):", err.message);
  }

  // Insert pipeline_run row
  const { data: row, error: insertError } = await supabase
    .from("pipeline_runs")
    .insert({
      input_text,
      target_platform,
      topic_id: topic_id ?? null,
      script,
      script_segments,
      hook_options,
      title_options,
      thumbnail_url,
      thumbnail_prompt,
      status: "draft",
    })
    .select()
    .single();

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  return Response.json(row);
}
