import Anthropic from "@anthropic-ai/sdk";
import { config, higgsfield } from "@higgsfield/client/v2";
import { createServerClient } from "@/lib/supabaseServer";

export const maxDuration = 120;

const PLATFORM_KEYWORDS = {
  tiktok: "tiktok",
  instagram_reels: "instagram",
  youtube_shorts: "youtube",
  x: " x ",
  linkedin: "linkedin",
};

function getPlatformKeyword(platform) {
  return PLATFORM_KEYWORDS[platform] ?? platform;
}

function isVertical(platform) {
  return ["tiktok", "instagram_reels", "youtube_shorts"].includes(platform);
}

async function fetchHooks(supabase, target_platform) {
  const keyword = getPlatformKeyword(target_platform);

  // Fetch candidate platform hooks (extra headroom for JS-side VERIFIED sort)
  const { data: platformHooks } = await supabase
    .from("hooks")
    .select("id, hook_text, platform, evidence_tier, category_pattern")
    .ilike("platform", `%${keyword}%`)
    .order("id", { ascending: false })
    .limit(20);

  const sorted = (platformHooks || []).sort((a, b) => {
    const av = (a.evidence_tier || "").toUpperCase().includes("VERIFIED") ? 1 : 0;
    const bv = (b.evidence_tier || "").toUpperCase().includes("VERIFIED") ? 1 : 0;
    return bv - av;
  });

  const selected = sorted.slice(0, 5);

  // Backfill from any platform if needed
  if (selected.length < 5) {
    const usedIds = selected.map((h) => h.id);
    const needed = 5 - selected.length;

    // Fetch enough rows to filter out already-selected ids
    const { data: backfill } = await supabase
      .from("hooks")
      .select("id, hook_text, platform, evidence_tier, category_pattern")
      .ilike("evidence_tier", "%VERIFIED%")
      .order("id", { ascending: false })
      .limit(needed + usedIds.length + 10);

    const filtered = (backfill || [])
      .filter((h) => !usedIds.includes(h.id))
      .slice(0, needed);

    selected.push(...filtered);
  }

  return selected;
}

async function fetchCorpus(supabase, target_platform) {
  const { data } = await supabase
    .from("corpus")
    .select("id, title, body_text, platform_published, date_published")
    .ilike("platform_published", `%${getPlatformKeyword(target_platform)}%`)
    .order("date_published", { ascending: false })
    .limit(3);

  return data || [];
}

function buildSystemPrompt(hooks, corpus) {
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

  return `You are a content strategist producing a short-form video script and hook options.

HOOK BANK (verified/sourced hooks from the research database — use these as inspiration and adapt them to the topic):
${hookBlock}

VOICE & STYLE REFERENCE (corpus samples — match this voice exactly):
${corpusBlock}

INSTRUCTIONS:
- Produce a complete short-form video script (opening hook line, body, CTA).
- Produce 4-5 hook_options: a mix of bank hooks adapted to this specific topic (source: "bank") and 1-2 newly generated hooks in the same voice as the corpus (source: "generated").
- Produce exactly 3 title_options.
- Return ONLY a JSON object with this exact shape — no prose, no markdown, no code fences:
{"script":"...","hook_options":[{"hook_text":"...","source":"bank"}],"title_options":["...","...","..."]}`;
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

  const raw = msg.content[0]?.text ?? "{}";
  // Strip accidental markdown fences if the model wraps anyway
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(cleaned);
}

async function callHiggsfield(thumbnail_prompt, target_platform) {
  config({
    credentials: `${process.env.HIGGSFIELD_KEY_ID}:${process.env.HIGGSFIELD_KEY_SECRET}`,
  });

  const jobSet = await higgsfield.subscribe("flux-pro/kontext/max/text-to-image", {
    input: {
      prompt: thumbnail_prompt,
      aspect_ratio: isVertical(target_platform) ? "9:16" : "16:9",
    },
    withPolling: true,
  });

  return jobSet.jobs[0]?.results?.raw?.url ?? null;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { input_text, target_platform, topic_id } = body;

  if (!input_text || !target_platform) {
    return Response.json(
      { error: "input_text and target_platform are required" },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Steps 1 & 2: fetch grounding data
  const [hooks, corpus] = await Promise.all([
    fetchHooks(supabase, target_platform),
    fetchCorpus(supabase, target_platform),
  ]);

  // Step 3: call Anthropic
  let aiResult;
  try {
    const systemPrompt = buildSystemPrompt(hooks, corpus);
    aiResult = await callAnthropic(systemPrompt, input_text, target_platform);
  } catch (err) {
    return Response.json(
      { error: `Anthropic call failed: ${err.message}` },
      { status: 502 }
    );
  }

  const { script, hook_options, title_options } = aiResult;

  // Step 4: build thumbnail prompt
  const topTitle = title_options?.[0] ?? input_text.slice(0, 80);
  const scriptOpening = (script ?? "").split(/[.\n]/)[0].slice(0, 120);
  const thumbnail_prompt = `${topTitle}. ${scriptOpening}. Cinematic, high-contrast, bold typography style.`;

  // Step 5: call Higgsfield (non-fatal)
  let thumbnail_url = null;
  try {
    thumbnail_url = await callHiggsfield(thumbnail_prompt, target_platform);
  } catch {
    // thumbnail failure is acceptable — row still saves
  }

  // Step 6: insert pipeline_run row
  const { data: row, error: insertError } = await supabase
    .from("pipeline_runs")
    .insert({
      input_text,
      target_platform,
      topic_id: topic_id ?? null,
      script,
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
