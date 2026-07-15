# Content Review Skill

Purpose: decide whether a raw news item (or a single finding within a
digest) is worth turning into a video for this niche — AI tools,
vibe-coding, build-in-public, AI SaaS — and, if so, how strong a
candidate it is.

## Scoring: 1–10, integer

Score across four weighted dimensions, then combine:

### 1. Specificity (0–3 points)

- 3: Names a specific tool/company/product/statistic/event with a clear
  "what happened."

- 2: Names a specific thing but the "what happened" is vague or implied.

- 1: General trend or theme, no single anchor entity/event.

- 0: Pure sentiment/mood observation with no concrete anchor at all.

### 2. Niche fit (0–3 points)

- 3: Directly about AI tools, vibe-coding, build-in-public, or AI SaaS —
  the exact niche.

- 2: Adjacent (general AI industry news, developer tooling) — relevant
  but not a bullseye.

- 1: Tangentially related (mentions AI in passing, broader tech).

- 0: Off-niche entirely.

### 3. Freshness / saturation (0–2 points)

Based on the web_search saturation check:

- 2: Breaking or recent (last few days), limited existing coverage.

- 1: Established but still actively discussed (weeks old).

- 0: Old, widely covered, unlikely to feel new to an audience (months old,
  saturated across many outlets).

### 4. Actionability for content (0–2 points)

- 2: Obvious video angle exists (a demo, a reaction, a breakdown, a
  build-along).

- 1: Could be covered but requires more creative framing to make
  interesting.

- 0: Hard to imagine a compelling video from this alone.

**Total: sum of all four (max 10).**

## Threshold

- **Score ≥ 6: PASS** — becomes a topic candidate, status `pending_review`.

- **Score 4–5: BORDERLINE** — becomes a topic candidate but flagged
  distinctly (see below) so a human reviewer knows it's a weaker pick.

- **Score ≤ 3: FAIL** — discarded, raw item marked `ignored`, never
  becomes a topic.

## Required output alongside the score

For every candidate that scores PASS or BORDERLINE, the reasoning must
state the score breakdown explicitly (e.g. "Specificity: 3, Niche fit: 3,
Freshness: 1, Actionability: 2 = 9/10") so a human reviewing it later can
see exactly why it passed, not just a final number.

## What does NOT count as a content piece

- Status/log messages from cron jobs themselves ("Working — 3 min",
  "Ran one test fire now") — score these 0 automatically, do not run
  full scoring.

- Pure conversational exchanges between the user and the bot ("Can you
  run this now?") — same, automatic 0.

- Self-improvement/meta messages about the bot's own configuration
  ("Patched SKILL.md in skill...") — automatic 0.

## Digest handling

When a single message contains multiple numbered findings, apply this
scoring independently to EACH finding, not to the message as a whole.
The message's overall framing/genre (digest, brief, trend report) has no
bearing on any individual finding's score.
