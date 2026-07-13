import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@/lib/supabaseServer";
import { NextResponse } from "next/server";

export const maxDuration = 30;

const PLATFORM_BRIEFS = {
  x: "X (Twitter): A punchy thread-opener. One sentence, ideally under 140 characters. Lead with the strongest claim — no preamble, no 'have you heard about'. Reads well cold.",
  tiktok: "TikTok: A spoken video hook for the first 1-2 seconds of audio. Short, direct, natural speech rhythm. Must work without any text on screen — the viewer is listening, not reading. Question or bold declarative statement.",
  instagram_reels: "Instagram Reels: A spoken video hook, same constraints as TikTok. First 1-2 seconds of audio. Must land without reading. Slightly warmer tone than TikTok is acceptable.",
  youtube_shorts: "YouTube Shorts: A spoken video hook for the first 1-2 seconds. Similar to TikTok/Reels. Can be slightly longer — up to 2 lines — if the claim needs a beat to land.",
  linkedin: "LinkedIn: A text-post opener. 1-2 sentences. Professional but direct and specific — avoid buzzwords and corporate softening. Concrete claim, not abstract. Can be slightly longer than X since the reader expects more context.",
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

  const systemPrompt = `You are a hook rewriter. You adapt a hook's format and tone for a specific publishing platform.

CRITICAL RULES — never break these:
- Preserve the exact claim of the original hook. Do not strengthen or weaken the core assertion.
- Do NOT add statistics, percentages, quotes, named sources, or any claim not present in the original hook text.
- Do NOT invent new information, examples, or comparisons.
- Change format, length, and tone only — not substance.
- The evidence tier is a constraint: "${hook.evidence_tier ?? "unclassified"}". It tells you how confident the original claim is. Do not make the rewritten hook sound more or less certain than the original.

Return only the rewritten hook text. No explanation, no preamble, no quotation marks around the output.`;

  const userMessage = `Original hook:
"${hook.hook_text}"

Target platform: ${target_platform}
Platform brief: ${platformBrief}

Rewrite the hook for this platform, preserving the original claim exactly.`;

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
