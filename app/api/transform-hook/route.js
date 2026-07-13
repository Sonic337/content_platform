import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";

export const maxDuration = 30;

const PLATFORM_BRIEFS = {
  x: `X (Twitter): Written to be READ, not spoken. One dense sentence, ideally under 140 characters. No spoken-cadence filler ('so,' 'okay,' 'listen,' 'wait'). Lead with the claim as a headline would — compressed, declarative, no setup. No colons after a word like "BREAKING" — just state the fact. Example transformation pattern: a hook like "People are freaking out about X" becomes a flat factual headline: "X does [specific thing]."`,
  tiktok: `TikTok: Written to be SPOKEN ALOUD, not read. Must sound like natural speech — contractions, casual phrasing, the kind of sentence a person would actually say on camera, not a written headline. No colons, no semicolons, no all-caps prefixes ('BREAKING:', 'ALERT:') — those are text conventions, not speech. Often works as a direct question or a first-person observation ('I just found out...', 'Wait, this is actually real?'). The rhythm must be distinctly conversational. If the output could pass as a tweet, it has failed this platform.`,
  instagram_reels: `Instagram Reels: Same as TikTok — written to be spoken aloud in the first 1-2 seconds of video. Natural speech rhythm, casual phrasing, no text-format conventions (no all-caps labels, no colons). Slightly warmer and more personal tone than TikTok is fine. Must sound like something a person would actually say, not something they would type.`,
  youtube_shorts: `YouTube Shorts: Spoken hook for the first 1-2 seconds, same spoken-aloud constraint as TikTok/Reels. Can be up to 2 sentences if the claim needs a beat to land. Avoid text conventions. The viewer is listening, not reading.`,
  linkedin: `LinkedIn: Written to be read by a professional audience. Up to 2 short sentences — slightly longer than X is acceptable. Measured, credible tone — avoid hype words ('insane', 'wild', 'unbelievable', 'massive'). Can use a light setup + payoff structure. Should read like a thoughtful practitioner's observation, not a viral caption or a news alert.`,
};

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { hook_id, target_platform } = body;
  if (!hook_id || !target_platform) {
    return NextResponse.json({ error: "hook_id and target_platform are required" }, { status: 400 });
  }

  const platformBrief = PLATFORM_BRIEFS[target_platform.toLowerCase()];
  if (!platformBrief) {
    return NextResponse.json(
      { error: `Unknown platform. Supported: ${Object.keys(PLATFORM_BRIEFS).join(", ")}` },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Fetch source hook
  const { data: hook, error: hookErr } = await supabase
    .from("hooks")
    .select("id, hook_text, evidence_tier, platform, category_pattern")
    .eq("id", hook_id)
    .single();

  if (hookErr || !hook) {
    return NextResponse.json({ error: "Hook not found" }, { status: 404 });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are a hook rewriter. You adapt a hook's format and tone for a specific publishing platform while preserving the original claim exactly.

PLATFORM BRIEF — follow this before anything else:
${platformBrief}

PLATFORM DIFFERENTIATION RULE: Two rewrites of the same hook for different platforms should sound clearly different in rhythm and structure, even though they assert the same fact. If your X version and your TikTok version could be swapped without anyone noticing, you have not followed the platform brief. The structural difference is the job.

SUBSTANCE RULES — these constrain what you may change:
- Preserve the exact claim of the original hook. Do not strengthen or weaken the core assertion.
- Do NOT add statistics, percentages, quotes, named sources, or any claim not present in the original hook text.
- Do NOT invent new information, examples, or comparisons.
- Change format, length, and tone only — not substance.
- Evidence tier of the original: "${hook.evidence_tier ?? "unclassified"}". Do not make the rewritten hook sound more or less certain than the original.

Return only the rewritten hook text. No explanation, no preamble, no quotation marks around the output.`;

  const userMessage = `Original hook:
"${hook.hook_text}"

Target platform: ${target_platform}

Rewrite the hook following the platform brief above. Make sure the result sounds structurally distinct from how this hook would read on a different platform.`;

  const msg = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 256,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = msg.content.find((b) => b.type === "text");
  const transformed_text = textBlock?.text?.trim() ?? "";

  if (!transformed_text) {
    return NextResponse.json({ error: "Model returned empty response" }, { status: 500 });
  }

  // Insert into hook_transforms
  const { error: insertErr } = await supabase.from("hook_transforms").insert({
    source_hook_id: hook_id,
    target_platform,
    transformed_text,
  });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    transformed_text,
    evidence_tier: hook.evidence_tier ?? null,
    target_platform,
  });
}
