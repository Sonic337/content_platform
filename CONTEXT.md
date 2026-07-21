open -e CONTEXT.md> **Living document rule:** This file must be updated, not left stale. At the end of any session that changes architecture, adds a module, makes a vendor/schema decision, or resolves one of the "Known gaps" below — update the relevant section before ending the session and commit `CONTEXT.md` alongside the code change in the same commit.

---

# Content Ops Platform — Project State

_Last updated: 2026-07-13 (session 3)_

## Before you start

Read this file first, then `AGENTS.md` (framework/tooling rules), then run `git log --oneline` to catch anything committed more recently than this file's last-updated date. The git log is the ground truth for what's actually in the repo; this file is the ground truth for decisions and context that aren't derivable from the code.

---

## 1. What this is

An internal content-operations dashboard for a two-person AI content creator operation producing short-form and long-form video (TikTok, Instagram Reels, YouTube Shorts, X, LinkedIn) about AI tools, vibe-coding, and build-in-public. The platform centralises topic research, hook storage, writing samples, and a generation pipeline that turns a news brief into a timestamped script + hook options + title options + thumbnail. All modules are manual-entry only for the alpha; no public-facing surface.

---

## 2. Architecture

### Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16.2.10 (App Router) | App Router Server Components + Route Handlers are a clean split between browser UI and server-only API calls (Anthropic, fal.ai, service-role Supabase) |
| Styling | Tailwind v4 + inline styles | Tailwind v4 uses `@import "tailwindcss"` / `@theme inline` — **not** v3 conventions. Inline styles used for dynamic values (tier colors) |
| Database / API | Supabase (Postgres + auto REST) | Hosted, no infra to manage; auto-REST API means external agents (Hermes, future automation) can write rows directly without a custom API layer |
| Text generation | `claude-sonnet-5` via `@anthropic-ai/sdk` | Extended-thinking model — response content blocks are `["thinking", "text"]`; always use `msg.content.find(b => b.type === "text")`, never `content[0]` |
| Image generation | `fal-ai/flux/dev` via `@fal-ai/client` | Higgsfield required a $30/500-credit minimum unsuitable for testing; fal.ai has no minimum. Result URL at `result.data.images[0].url` |
| Fonts | `next/font/google` with `variable` option | CSS custom properties: `--font-fraunces`, `--font-ibm-plex-mono`, `--font-ibm-plex-sans`. Applied as classes on `<html>` |
| Deploy target | Vercel | `export const maxDuration = 120` on route files for long-running generation requests |

### Key architectural constraints

- **Server/client split:** `lib/supabaseServer.js` uses `SUPABASE_SECRET_KEY` (service-role) — server-only. `lib/supabaseClient.js` uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` — browser only. Never cross these.
- **"use client" requirement:** Any component that uses hooks or receives function props must be a Client Component. All five page files (`topics`, `hooks`, `corpus`, `pipeline`, `analytics`) are `"use client"` because they pass `getRowColors` (a function) to `DataTable`.
- **Route Handlers are server-only:** `app/api/generate/route.js` is the only place Anthropic and fal.ai are called. `serverExternalPackages: ["@fal-ai/client", "@anthropic-ai/sdk"]` in `next.config.mjs` keeps them out of the browser bundle.
- **Retrieval strategy:** Structured-filter + keyword-overlap ranking. Deliberately NOT embeddings-based. Vector columns (`embedding vector(1536)`) exist on `hooks`, `corpus`, and `topics` — nullable, reserved for a future semantic search upgrade. Keeping it simple for the alpha was an explicit decision, not an oversight.
- **RLS:** Enabled on all tables with open `for all using (true)` policies — single-team alpha. Tighten before giving external agents write access.

### Design direction

Ink-dark fixed theme (`#10151A` background, `#E8E6DE` foreground). Evidence-tier identity is communicated via 3px left-border color stripes on list rows (green = VERIFIED, amber = SOURCED/UNVERIFIED, red = NOT CONFIRMED/REFUTED), not badges. Body text in Fraunces serif; metadata in IBM Plex Mono. This is a deliberate choice tied to the evidence-graded research subject matter. Do not "improve" it toward generic SaaS styling without flagging that as a real design change, not a bug fix.

Color constants live in `lib/tierColor.js`:
- `tierColors(evidenceTierStr)` → `{ border, text }` for hook evidence tiers
- `topicStatusColors(statusStr)` → `{ border, text }` for topic statuses (new = green, reviewed = amber)

Amber (`#D9A257` text / `#C98A3E` border) is also reused for the hook aging warning (times_used ≥ 5) to keep the palette consistent.

---

## 3. Module status

### Topics feed (`app/topics/page.js`, table: `topics`)

**Status: built, placeholder data only.**

DataTable with filter by status, add-row form. Fields: title, summary, source_name, source_url, tags, status.

**Hermes integration is intentionally deferred.** Hermes is a separate Telegram cron agent that pulls 10–20 sources daily. It will eventually write directly to the `topics` table via Supabase REST. For now, the table is manually seeded. This is a deliberate decision — wiring Hermes before the pipeline is stable would create noise.

### Hook bank (`app/hooks/page.js`, table: `hooks`)

**Status: built, real data.**

117 rows imported from `master_hook_bank.xlsx` via Supabase CSV import. Schema: `hook_text`, `platform`, `category_pattern`, `creator_archetype`, `mechanism`, `evidence_tier`, `source_report`, `notes`, `times_used` (int, default 0), `last_used_at` (timestamptz, nullable).

**Evidence tier — 7 canonical values** (migration 007 replaced the original 4-value constraint and normalised all descriptive variants using LIKE-pattern UPDATEs):

| Value | Stripe color |
|---|---|
| `VERIFIED 3-0` | Green |
| `VERIFIED 2-1` | Green |
| `SOURCED UNVERIFIED` | Amber |
| `UNVERIFIED-OBSERVED` | Amber |
| `UNVERIFIED/MIXED` | Amber |
| `NOT CONFIRMED` | Red |
| `REFUTED` | Red |

**UI (Feature 1):** Per-tier toggle pills in the control bar. Default view excludes `NOT CONFIRMED` and `REFUTED`. Toggling a pill adds/removes it from the Supabase `.in()` filter — the query always reflects exact DB-side filtering, not client-side post-fetch filtering. Each row also shows `times_used` (e.g. `3×`) and `last_used_at` (locale date) in the meta line; `times_used ≥ 5` renders in amber to signal potential overuse.

**Fetch and ranking in the pipeline:** `fetchHooks()` pulls the top 40 by platform match, keyword-scores across `category_pattern + hook_text + mechanism + notes`, sorts by score then VERIFIED tiebreaker, takes top 5, and backfills from any-platform VERIFIED hooks if needed. By default `NOT CONFIRMED` and `REFUTED` tiers are excluded via `.not('evidence_tier', 'in', ...)`. Pass `include_unverified: true` in the POST body to override.

**Hook aging (Feature 2):** Every bank hook surfaced in a generated draft is atomically incremented via the `increment_hook_usage(uuid[])` Postgres function (migration 008), called after a successful `pipeline_runs` insert — non-fatal.

**Per-platform hook transformer (Feature 6):** A "Transform for platform" control appears in the footer of each row on `/hooks`. Selecting a platform and clicking Transform calls `POST /api/transform-hook` with `{ hook_id, target_platform }`. The route checks the `hook_transforms` table (migration 013) for a cached result first; on a cache miss it calls `claude-sonnet-5` with a platform-specific brief and inserts the result. A "Re-run" button (shown after any result is present) forces a fresh generation, bypassing the DB cache. Platform briefs distinguish written-to-be-read formats (X, LinkedIn) from spoken-aloud formats (TikTok, Reels, Shorts). The route file is `app/api/transform-hook/route.js`; it uses the service-role client because it writes to `hook_transforms`. `times_used` is NOT incremented by transforms — only by generation drafts surfacing a hook.

### Writing corpus (`app/corpus/page.js`, table: `corpus`)

**Status: import UI built; corpus content is 0 rows (confirmed live query 2026-07-13).**

The page has two modes toggled by a control in the UI:
- **Add row** — the standard DataTable add-row form for single entries.
- **Bulk import** — paste multiple pieces separated by `---` delimiter lines. Each piece's title is derived from its first line (≤80 chars). A shared platform and comma-separated tags can be applied to the whole batch. All pieces are inserted in one Supabase `.insert([...])` call. A `key={tableKey}` prop bump on DataTable forces a re-fetch after import.

**This remains the highest-priority gap.** The pipeline's `buildSystemPrompt()` includes a "VOICE & STYLE REFERENCE" block built from corpus samples. With 0 rows the AI has no voice grounding. Filling this is a manual task — paste past captions, scripts, or notes into the bulk import UI.

### Pipeline (`app/pipeline/page.js`, `app/api/generate/route.js`, table: `pipeline_runs`)

**Status: built and functional.**

**UI:** Platform select (tiktok / instagram_reels / youtube_shorts / x / linkedin), optional target duration in seconds, optional topic link, Generate button. Generated runs display script beats as a timestamped list (Fraunces serif for beat text, mono for `[start–end s] LABEL`). Runs that pre-date the `script_segments` column fall back to rendering the plain-text `script` field.

Hook options render as three visually separated sections — **Conservative / Mixed / Experimental** — each with its own accent color (green / amber / red). A single `selectedHook` state covers all three groups; only one hook can be selected across them. Each hook option displays its `evidence_tier` inline, color-coded via `tierColors()`.

**Approve button fix:** Clicking Approve atomically saves `selected_hook`, `selected_hook_tier`, and `selected_title` in the same DB write as the `status: "approved"` change. Previously these were two separate writes (Save selections + Approve), which silently dropped selections if Approve was clicked first.

`selected_hook_tier` (migration 012) is saved at approval time from the resolved hook entry's `evidence_tier`. This is necessary because bank hooks are AI-adapted/paraphrased before being shown for selection — exact text-matching against the original `hooks.hook_text` after the fact would always fail.

**Generation flow (`POST /api/generate`):**

1. Extract keywords from `input_text` (stopword-filtered)
2. Parallel fetch: `fetchHooks()`, `fetchCorpus()`, `fetchVisualPatterns()` — all keyword-ranked
3. Build system prompt with HOOK BANK (numbered 1–N with tier labels) + VOICE & STYLE REFERENCE + VISUAL PATTERNS blocks
4. `claude-sonnet-5` → parse JSON response (separate try/catch from API call)
5. Resolve `bank_index` → `evidence_tier` for each bank-sourced hook option; strip `bank_index` from final payload; collect bank hook UUIDs for usage tracking
6. Guard: do not insert if `script_segments`, `hook_options`, or `title_options` are missing
7. Build `thumbnail_prompt` using top title + opening beat + top visual pattern (if any)
8. `fal-ai/flux/dev` thumbnail generation (non-fatal)
9. Insert `pipeline_runs` row
10. Call `increment_hook_usage(uuid[])` for bank hooks surfaced in this draft (non-fatal)

**Request body params:**
- `input_text` (required), `target_platform` (required)
- `target_duration_sec` (optional integer) — passed to the system prompt to constrain segment timing
- `topic_id` (optional uuid)
- `include_unverified` (optional boolean, default `false`) — when `true`, includes `NOT CONFIRMED` and `REFUTED` hooks in `fetchHooks()` results

**Response shape (Anthropic must return exactly this; route resolves bank_index before storing):**
```json
{
  "script_segments": [{"start_sec": 0, "end_sec": 5, "label": "hook", "text": "..."}],
  "hook_options": {
    "conservative": [{"hook_text": "...", "source": "bank", "evidence_tier": "VERIFIED 3-0"}],
    "conservative_note": "Only 0 truly VERIFIED hooks available; included tiers: SOURCED UNVERIFIED as fallback.",
    "mixed": [{"hook_text": "...", "source": "bank", "evidence_tier": "UNVERIFIED-OBSERVED"}, {"hook_text": "...", "source": "generated"}],
    "experimental": [{"hook_text": "...", "source": "generated"}]
  },
  "title_options": ["...", "...", "..."]
}
```

**Hook tier groups and rules:**
- `conservative` (2–3 hooks): VERIFIED 3-0 or VERIFIED 2-1 only. Fallback order: VERIFIED 3-0 → VERIFIED 2-1 → SOURCED UNVERIFIED only. Never reaches UNVERIFIED-OBSERVED or lower. Acceptable to have fewer than 2 hooks rather than go lower.
- `mixed` (2–3 bank + 1 generated): any tier except NOT CONFIRMED / REFUTED.
- `experimental` (1–3 hooks): generated-only when `include_unverified: false`; may include UNVERIFIED/MIXED or lower bank hooks when `include_unverified: true`.
- `conservative_note`: **server-computed**, never model-generated. Set when `conservative` is empty ("No hooks at VERIFIED or SOURCED UNVERIFIED tier were relevant to this topic — none included.") or when fallback tiers were used ("Only N truly VERIFIED hook(s) available; included tiers: [actual tiers] as fallback."). Derived from the actual `evidence_tier` values after `resolveHookEntry()` runs, so it's structurally impossible for it to misreport.

**Backward compatibility:** Old `pipeline_runs` rows have `hook_options` as a flat array. Read paths in `app/pipeline/page.js` and `app/hook-performance/page.js` detect `Array.isArray()` and normalize to `{ conservative: [], mixed: oldArray, experimental: [] }`.

`script` (plain-text concatenation of all segments) is also stored as a fallback/search field.

**Schema note:** `pipeline_runs.topic_id` references `topics.id` but `topics` uses `uuid` PK and `pipeline_runs` was created with `bigint` FK — this mismatch exists in the live DB. Currently nullable so it doesn't block inserts (topic linking not wired in the UI yet).

### Hook performance audit (`app/hook-performance/page.js`)

**Status: built, read-only.**

A post-hoc audit view joining `pipeline_runs` (approved/published) to `analytics` via `pipeline_run_id`. Shows each approved run's selected hook, its `selected_hook_tier` (read directly from the column — no text-matching), and aggregated engagement metrics (views, likes, comments) where analytics rows exist. Gives a longitudinal view of which evidence tiers produce better-performing content.

`selected_hook_tier` is available directly on `pipeline_runs` because it was saved at approval time (migration 012). Prior to migration 012, the hook tier had to be re-derived by text-matching `selected_hook` against `hooks.hook_text` — this was broken in practice because bank hooks are adapted/paraphrased by the AI before appearing for selection.

### Visual patterns (table: `visual_patterns`)

**Status: 8 rows seeded from research reports.**

Used by `fetchVisualPatterns()` in the generate route to ground thumbnail prompts and script visual cues. Migration 005 (reference only, already applied) adds this table. 8 rows were seeded in session 2 from the visual pattern research report. Each row has `pattern_text`, `platform`, `category_pattern`, and `evidence_tier`.

### Analytics (`app/analytics/page.js`, table: `analytics`)

**Status: built, 0 rows.**

DataTable with filter by platform, add-row form. Columns displayed: platform, views, likes, comments, posted_at. Full form fields: platform, post_url, posted_at, views, likes, comments, shares, saves, avg_watch_time_sec, retention_pct (all numeric — coerced via `DataTable`'s `numeric` field type), notes, plus a pipeline_run_id selector (fetches last 20 runs, labeled by `selected_title` or first 60 chars of script). `pipeline_run_id` is optional/nullable and is passed as a **uuid string** — do not coerce to `Number()` (that would produce `NaN`; the column is uuid, not bigint).

---

## 4. Environment variables

| Variable | Where used | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabaseClient.js`, `lib/supabaseServer.js` | Supabase project URL — safe to expose to browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabaseClient.js` only | Publishable/browser key — safe to expose |
| `SUPABASE_SECRET_KEY` | `lib/supabaseServer.js` only | Service-role key — **never expose to browser**, server-only |
| `ANTHROPIC_API_KEY` | `app/api/generate/route.js` only | Anthropic API key — server-only |
| `FAL_KEY` | `app/api/generate/route.js` only | fal.ai API key — server-only |

All live values are in `.env.local` (gitignored). No `.env`, `.env.production`, or `.env.development` files exist; `.env.local` is the only env file and Next.js dev mode loads it exclusively.

---

## 5. Known gaps (priority order)

1. **Corpus content is empty (0 rows)** — Bulk import UI is built and working; the gap is the human operator pasting real past writing (captions, scripts, notes) into it. Until that happens the AI has no voice grounding and `buildSystemPrompt()` sends an empty VOICE & STYLE REFERENCE block.

2. ~~**Visual patterns table is empty**~~ — 8 rows seeded from research reports. Thumbnail grounding is now active for matching topics.

3. **Topics table is manually seeded** — No live signal from Hermes yet. Deferred by design until the pipeline is stable and the Hermes integration is scoped.

4. **Analytics has no data** — Baseline comparisons require logged posts. Will accumulate naturally as the team publishes and enters rows manually.

5. **`pipeline_runs.topic_id` FK type mismatch** — `topics.id` is `uuid`, the FK column is `bigint`. Currently nullable so it's not blocking, but topic linking can't be properly wired until this is resolved (either change `topics` PK to bigserial or change the FK column to `uuid`).

6. **No embeddings** — Vector columns exist on `hooks`, `corpus`, `topics`. Semantic search is deferred; keyword ranking is the current retrieval strategy.

7. **RLS is open** — `for all using (true)` policies are appropriate for single-team alpha. Tighten before granting external agent write access.

8. **Supabase SQL editor silent failure (operational watch)** — This project's SQL editor has repeatedly reported "Success. No rows returned" for `ALTER TABLE`, `CREATE FUNCTION`, and `UPDATE` statements run in isolation, without the change actually landing — confirmed by a subsequent `SELECT` in a separate execution showing no change. Always pair a write with a verifying `SELECT` in the same execution block (e.g. `ALTER TABLE ...; SELECT column_name FROM information_schema.columns WHERE table_name = 'hooks';`). Do not trust a bare success message for schema or data changes.

10. **Remove placeholder copy referencing unbuilt features** — `app/pipeline/page.js` previously had a line referencing "cron job generation" next to the topic selector; removed because Hermes (the cron-based topic ingestion agent) is not built. If similar placeholder copy appears elsewhere referencing unbuilt features, remove it the same way rather than leaving it as aspirational UI.

---

## 6. Pending external work / research status

| Report | Status | Notes |
|---|---|---|
| Short-form script pacing / beat-length research | Applied | Informed the `script_segments` scaffold patterns and experimental timing framing in `buildSystemPrompt()` (session 2, commit `d0f7294`). |
| 20–30 real dated content topics | Applied | 20 rows seeded into `topics` with correct `original_date` values (session 2). |
| Thumbnail / visual pattern research | Applied | 8 rows seeded into `visual_patterns` (session 2). |
| Platform performance benchmarks | Reviewed, not yet wired | Report reviewed and content confirmed accurate/usable. Intentionally deferred — no feature code written. Will inform analytics prioritization once the team has enough real logged performance data to compare against the benchmarks. |
| X video-length research | Reviewed, not yet wired | Report reviewed and content confirmed accurate/usable. Intentionally deferred for the same reason — no feature code written. |

**Jupitrr integration — explicitly deferred.** Jupitrr (auto-captioning / B-roll tool) was researched as a potential integration point. No public API or developer documentation could be found. No code was written. Revisit only if their support team confirms an API exists.

---

## 7. DataTable component notes

`components/DataTable.js` is a generic shared component used by all five module pages. Key behaviors:

- Fetches its own data on mount (and when filter state changes) using the browser Supabase client
- `key` prop bump on the parent forces remount + re-fetch (used by corpus bulk import)
- `extraPayload = {}` prop is merged into the insert payload (used by analytics to inject `pipeline_run_id`)
- Field types in `formFields`: `text`, `textarea`, `select` (needs `options: []`), `tags` (comma-separated string → array on submit), `numeric` (`<input type="number">` → `Number()` coercion on submit)
- `bodyKey`: column rendered as Fraunces serif body text
- `tierKey`: column rendered with `getRowColors(row).text` accent color
- `getRowColors(row)`: function returning `{ border, text }` for the 3px left stripe and tier text
- `tierFilterKey` + `allTierOptions` + `defaultExcludedTiers`: wire up the tier-toggle pill filter; query uses `.in(tierFilterKey, includedTiers)` so filtering is DB-side
- `usageKey` + `usageWarnAt` (default 5): when a meta column's key matches `usageKey` and its raw numeric value is ≥ `usageWarnAt`, the value renders in amber (`#D9A257`) instead of muted gray
- `columns[].format`: optional `(rawVal) => string` function; if provided, used instead of `String(rawVal)` for display. Raw value is still used for the `usageKey` threshold comparison.
- `renderRowFooter`: optional `(row) => ReactNode` function. Called at the bottom of each row div, after the meta columns. Used by `/hooks` to render the per-platform transform control + result. Non-breaking default is `null`.

---

## 8. Migrations

All migrations in `supabase/migrations/` are **reference only** after they've been applied to the live database. Never re-run them. Create new numbered files for new schema changes.

| File | Status | What it does |
|---|---|---|
| `001_alpha_schema.sql` | Applied | Creates `topics`, `hooks`, `corpus`; enables pgvector; RLS open policies |
| `003_pipeline_runs.sql` | Applied | Creates `pipeline_runs`; RLS open policy |
| `004_script_segments.sql` | Applied, no file | Adds `script_segments jsonb` column to `pipeline_runs` |
| `005_visual_patterns.sql` | Applied, no file | Creates `visual_patterns` table |
| `006_analytics.sql` | Applied | Creates `analytics` table with optional `pipeline_run_id` FK |
| `007_hooks_tier_constraint.sql` | Applied | Drops old 4-value check constraint; LIKE-pattern UPDATEs normalise all descriptive variants to 7 canonical tier values; re-adds constraint inside a DO block (idempotent) |
| `008_hook_usage_tracking.sql` | Applied | Adds `times_used` (int, default 0, not null) and `last_used_at` (timestamptz) to `hooks`; creates `increment_hook_usage(uuid[])` RPC for atomic batch increment |
| `009_import_review_queue.sql` | Applied | Enables `pg_trgm`; adds GIN trigram index on `hooks.hook_text`; creates `import_review_queue` table and `find_similar_hooks(query_text, threshold)` RPC |
| `011_topics_original_date.sql` | Applied | Adds `original_date date` (nullable) to `topics`; wired into `POST /api/import-topics` |
| `012_selected_hook_tier.sql` | Applied | Adds `selected_hook_tier text` (nullable) to `pipeline_runs`; saved at approval time |
| `013_hook_transforms.sql` | Applied | Creates `hook_transforms` table (`source_hook_id` → `hooks`, `target_platform`, `transformed_text`); GIN lookup index; RLS open policy |

---

## 9. Operational findings

Things learned in practice that aren't derivable from the code but are worth preserving for future sessions.

**Supabase SQL editor silent failure:** The SQL editor has intermittently reported "Success, no rows returned" for write statements that did not actually commit. Pairing a write with a verifying `SELECT` in the same execution (e.g. `UPDATE ...; SELECT count(*) FROM hooks WHERE evidence_tier = 'SOURCED UNVERIFIED';`) reliably surfaces the true state. Do not trust "Success" alone for schema changes or data migrations.

**Hook bank text fields contain descriptive suffixes:** The original `master_hook_bank.xlsx` data has evidence_tier values like `NOT CONFIRMED (0-3)`, `VERIFIED 3-0 across multiple niches`, `REFUTED 10/10`, etc. Migration 007 handles this with LIKE-pattern UPDATEs. The same pattern may apply to other text columns (`category_pattern`, `mechanism`, `creator_archetype`) — verify before assuming exact-match filtering will work on any column sourced from the original spreadsheet.

---

## Session 2 — Research integration (script prompts, topics seed, visual patterns)

_2026-07-13. Full detail previously lived in SESSION_SUMMARY.md, now folded in here as the single source of truth. That file has been archived._

**Script segments prompt rewrite (`app/api/generate/route.js`, commit `d0f7294`):** Replaced the generic `script_segments` instruction with three named scaffold patterns:
- **A: Result-first AI demo** — hook, context, demo, proof, limitation, cta
- **B: Build-in-public update** — hook, context, mechanism, proof, result, limitation, cta
- **C: Talking-head AI analysis** — hook, context, demo, result, limitation, cta

Explicitly framed as "TIMING IS AN EXPERIMENTAL HYPOTHESIS" — no platform has published verified beat-length data, so this is stated as a testable structure, not a proven formula. Same commit updated the thumbnail visual-cue label from "proven thumbnail/visual direction" to "platform-grounded visual direction — evidence labels indicate confidence level; treat as testable starting points, not proven formulas," matching the project's evidence-tier honesty elsewhere.

Verified with 3 real generation tests (TikTok/result-first, Instagram Reels/build-in-public, YouTube Shorts/talking-head) — all passed: sequential non-overlapping timestamps summing to the target duration, varied beat labels, correct hook/title counts.

**Topics import route (`app/api/import-topics/route.js`, commit `612a6de`):** New POST endpoint, accepts `{ rows: [...] }`, validates `title` is required, batch-inserts into `topics`. Used to seed the 20 real dated topics (June 30 – July 10 2026) referenced elsewhere in this document — confirmed via Supabase REST `content-range: 0-0/20`.

**Visual patterns seeded (table `visual_patterns`):** 8 rows inserted directly via Supabase REST (anon key, application-level write) from the visual-pattern research report — these are the same 8 rows referenced in Section 3 above.

**Self-audit result:** no placeholder text, no unverified timing claims stated as fact, no schema changes required (existing `visual_patterns` columns were sufficient).

---

## Session 4 — Hermes/Sparkron news ingestion + AI analysis pipeline (this session)

### What was built, in order (see git log c20a964..HEAD for full commit list)

**1. Telegram webhook ingestion (commit 26014f0)**
- New table `raw_news_items`: telegram_message_id, telegram_chat_id,
  message_text, posted_at, received_at, raw_payload (jsonb), status
  (default 'unprocessed'), created_at. Unique constraint on
  (telegram_chat_id, telegram_message_id) — ON CONFLICT DO NOTHING on
  every insert, so re-delivery/re-fetching never creates duplicates.
- New route `POST /api/hermes-webhook` — verifies
  X-Telegram-Bot-Api-Secret-Token header against TELEGRAM_WEBHOOK_SECRET,
  inserts on valid text messages, always returns 200 to Telegram (per
  Telegram's retry semantics) except on auth failure (401).
- Tested end-to-end against a personal test bot (@SonicHermesNew_bot, NOT
  the real Sparkron/Hermes bot). Confirmed one real row landed correctly.
- Real bugs hit and fixed during setup (documented for pattern-recognition,
  same as Session 2/3 bugs list): 
  - GramJS/telegram package's `telegram/sessions` import is a directory
    import unsupported under strict ESM — fixed by importing
    `telegram/sessions/index.js` explicitly in all 3 files that use it.
  - New files were created locally by Claude Code but never committed —
    Vercel deployed a build missing the route entirely (404). Lesson:
    after any Claude Code session, always run `git status` before
    assuming anything is deployed.
  - `SUPABASE_SECRET_KEY` in Vercel was set to a corrupted value (the key
    duplicated with a literal newline between copies) from a bad
    copy-paste during initial Vercel env var setup — caused a cryptic
    `Headers.set: invalid header value` error. Lesson: after any manual
    Vercel dashboard env var entry, verify with `vercel env pull` and
    compare against the intended value, don't trust the masked
    "Sensitive" display.
  - `TELEGRAM_WEBHOOK_SECRET` was initially set to an empty string in
    Vercel (added as a key with no value during the New Project screen) —
    caused persistent 401s that looked like a secret mismatch but were
    actually a missing value. Same lesson as above.
  - A pre-existing, unrelated local service (`ai.hermes.gateway`, a
    launchd-managed background process from a separate personal project
    at `~/practice/hermes-agent`) was found to be actively polling the
    same bot token via long-polling, which silently cleared our webhook
    registration repeatedly. Stopped via
    `launchctl bootout gui/$(id -u)/ai.hermes.gateway`. Not expected to
    recur unless that separate Hermes CLI tool is reinstalled/restarted.

**2. Manual Telegram group fetch — "Fetch group news" (commits 4259576, d253df5, 09ea209)**
- Deliberately NOT automated/scheduled — button-click only, per explicit
  decision to stay clearly within normal personal-account usage patterns
  rather than run a standing background job against a personal Telegram
  account (MTProto/GramJS, not the Bot API).
- One-time local-only login: `scripts/telegram-login.mjs` (interactive,
  never deployed) produces a session string, saved as
  TELEGRAM_USER_SESSION in both .env.local and Vercel. This is a
  high-sensitivity credential — equivalent to being logged into the
  user's real Telegram account, not scoped like a bot token.
- `scripts/list-telegram-dialogs.mjs` (local-only) lists all groups/
  channels with their real IDs — used once to identify the "Cron Jobs"
  group (basic Group type, id 5555873255) as TELEGRAM_GROUP_IDENTIFIER.
- New route `POST /api/fetch-group-news`, button on `/topics`. Fetches up
  to 500 recent messages via GramJS, filters to a 48-hour window
  (FETCH_WINDOW_HOURS constant), inserts into raw_news_items with the
  same dedup constraint as the webhook path. Returns { scanned,
  withinWindow, inserted, skipped }.
- Real bug fixed: bare numeric group IDs for basic (non-super) Telegram
  Groups get misresolved by GramJS as PeerUser instead of PeerChat unless
  explicitly constructed via `Api.InputPeerChat`. Fixed; code comment
  left explaining Channels/Supergroups need InputPeerChannel instead if
  TELEGRAM_GROUP_IDENTIFIER is ever pointed at a different group type.
- Confirmed working end-to-end against the real "Cron Jobs" group,
  including confirmed correct dedup behavior across repeated real clicks
  (second click on same time window: 0 new, 10 duplicates).

**3. AI analysis pipeline — "Run News" (commits 958b450, 477a919, 59dfae9) — bug below was FIXED in Session 6, see that section**
- New migration 015: added `status` column values expanded from the
  pre-existing ('new','reviewed','used') to ('approved','pending_review',
  'rejected'); all 20 pre-existing seeded topics migrated to 'approved'.
  Added `source_raw_news_item_id` (FK to raw_news_items) and
  `ai_reasoning` (text) columns to topics.
  IMPORTANT CORRECTION TO EARLIER SESSION DOCS: topics already had a
  `status` column before this session (default 'new') — this was never
  documented in earlier CONTEXT.md versions. Worth checking for other
  undocumented columns if similar surprises show up elsewhere.
- New route `POST /api/analyze-news`, accepts { rawNewsItemIds: string[] }
  — same route serves both "process all unprocessed" (batch) and
  "process this one" (individual) buttons on /topics.
- Pipeline per raw item: Step 1 relevance+extraction (Claude,
  claude-sonnet-5, strict JSON) → Step 2 dedup check against last-60-days
  topic titles (Claude) → Step 3 non-blocking web_search saturation check
  → Step 4 insert into topics as status='pending_review' (NEVER
  auto-approved — human must click Approve on /topics).
- Pipeline's topic picker (`app/pipeline/page.js`) now filters
  `.eq("status", "approved")` so pending_review/rejected topics never
  appear as generation input.
- /topics UI: status filter pills (approved/pending_review/rejected),
  collapsible "Raw messages (N unprocessed)" section with per-row
  "Process" buttons, "Run news" batch button, Approve/Reject buttons on
  pending_review rows with ai_reasoning shown inline.

  **KNOWN BUG AT THE TIME, FIXED IN SESSION 6 — kept here for the original diagnostic detail:**
  Real Sparkron/Hermes cron-brief digest messages (format: "Cronjob
  Response: twice-daily-x-reddit-feed-brief-XXXX", containing ~10
  numbered findings) are being rejected WHOLESALE by Step 1's relevance
  check, with reasoning like: "This is a meta-analysis of social media
  sentiment/trends rather than concrete news events." The model judges
  the message's overall framing (reads as "analysis") before ever
  considering whether individual numbered findings within it are
  concrete enough to be separate topics. This defeats the entire
  digest-splitting feature (commit 477a919) — splitting logic is present
  in the code (JSON array output, per-candidate dedup/insert loop) and
  is believed structurally correct, but never executes because Step 1's
  system prompt evaluates relevance holistically BEFORE checking for
  digest structure, so digests never clear the relevance bar in the
  first place.
  A fix was scoped (restructure Step 1's system prompt so digest/numbered-
  list detection happens FIRST and structurally, with each numbered
  finding getting its own independent relevant/not-relevant judgment,
  rather than one holistic judgment on the whole message) but NOT YET
  IMPLEMENTED OR TESTED as of end of this session. See "Immediate open
  items" below — this is the top item.
  Debug logging was added (console.log of raw Step 1 and Step 2 API
  responses) to app/api/analyze-news/route.js to diagnose this — safe to
  leave in place or remove once the fix is confirmed working.

### Current real data state (as of end of session, verify before trusting)
- raw_news_items: 10 real rows from the "Cron Jobs" group fetch, mostly
  status='ignored' (either genuinely not relevant, or caught by the
  digest-relevance bug above), one reset to 'unprocessed' for testing
  and currently sitting there.
- topics: 20 original seeded rows (status='approved') + a small number of
  AI-created rows from before the digest-relevance bug was discovered,
  including one broad "Trend Digest: Multi-Agent Coding Workflows &
  Rising Reliability/Trust Concerns" meta-topic (status='approved', user-
  approved before the splitting feature existed) that should probably be
  reviewed/replaced once the digest bug is fixed and re-run.

### New env vars this session (all added to .env.local.example and Vercel)
- TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (webhook path)
- TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_USER_SESSION,
  TELEGRAM_GROUP_IDENTIFIER (group-fetch path — TELEGRAM_USER_SESSION is
  high-sensitivity, treat as equivalent to an account password)

### Items from this session, resolved status as of Session 6
1. ~~Fix the digest-relevance bug~~ — FIXED, see Session 6.
2. ~~Reset raw item, re-test~~ — DONE, confirmed working, see Session 6.
3. ~~Decide on the broad 'Trend Digest...' meta-topic~~ — RESOLVED, it was
   deleted during Session 6's debugging pass (isolated to test the
   dedup collision) and never recreated. No longer present.
4. Debug console.log lines — REMOVED in Session 6, then a DIFFERENT set
   of debug logging was added and removed again for the timeout
   investigation. None remain as of Session 7 (see below).
5. Ingestion was tested against a PERSONAL TEST BOT and the "Cron Jobs"
   group — this is STILL the case as of Session 7. Not yet confirmed
   whether this is the final intended production source or a
   standing test setup. Still open.
6. xAI/Grok integration — STILL deferred, not started, not scheduled
   in the current 7-day roadmap's grounded design docs either.
7. Corpus is STILL 0 rows as of Session 7 — still the single highest-
   priority gap. defaultExcludedTiers risk — not revisited, still open
   but low urgency. Platform benchmarks/X video-length reports — still
   unused, still deliberately held in reserve pending real Analytics data.

## Session 5 — topic linking fix, generate route thinking-behavior confirmed

_2026-07-20._

**Fixed:** pipeline_runs.topic_id was bigint against topics.id being uuid
(migration 016) — a valid FK relationship was never actually possible.
Confirmed 31 existing rows all had topic_id = null before the fix, no
data lost. Separately, app/pipeline/page.js's "Pick topic" flow was
calling Number(topicId) on what is a UUID string, which silently
produced NaN -> null on every request, meaning topic linking never
worked from the UI even before the schema was wrong. Both fixed
together; confirmed working end-to-end via a real generate call showing
a populated topic_id in the resulting row.

**Investigated, not a bug:** app/api/generate/route.js's Anthropic calls
return `content block types: ['thinking', 'text']` on every request.
Confirmed via direct grep that nothing in this codebase explicitly
enables thinking -- this is claude-sonnet-5's default behavior, already
correctly handled by the existing `msg.content.find(b => b.type ===
"text")` pattern (never content[0]). Nothing to toggle here; do not
re-investigate this as a bug.



## Session 6 — analyze-news timeout/billing bug, multi-date tracking, archive system

_2026-07-21._

**Fixed: analyze-news silently burned paid API calls on timeout.**
maxDuration was 120s. Running "Run news" on a large batch (13+ raw
items) triggered a Vercel 504 kill mid-batch. Every Anthropic call
already made before the kill (Step 1 scoring, dedup checks, saturation
searches) was already billed, but the function was killed before
reaching the status update for whatever item it was on — so those
items stayed 'unprocessed' and would be re-billed in full on the next
click, with zero record anything had happened. Real cost was lost
confirmed via a live count query: a 13-item batch left only 4 processed,
9 still unprocessed, with no visibility into what happened beyond a
confusing "Unexpected token 'A'" JSON-parse error on the frontend (the
frontend was trying to parse Vercel's plain-text timeout page as JSON).

Fix: maxDuration raised to 300 (Vercel's real hard ceiling on this
plan — there is no higher config value, do not try to raise it
further). A time-budget check (BUDGET_MS, currently 200_000 — lowered
from an initial 270_000 after real production data showed items take
longer than originally estimated) runs at the top of each outer loop
iteration, before starting a new item. If the budget is exceeded, the
loop stops cleanly, returns { stoppedEarly: true,
remainingUnprocessedCount: N } instead of letting Vercel kill it
uncontrolled. app/topics/page.js shows this clearly in amber
(matching the existing warning color) with a "click Run news to
continue" prompt. Confirmed the existing loop was already fully
sequential (no Promise.all/hidden parallelism) before this fix, so
each item's work fully commits before the next starts — verified via
direct code read, not assumed.

Separately confirmed: part of the same outage was the Anthropic API
key running out of credit (user manually confirmed and refilled,
$10). The timeout bug and the credit exhaustion were two independent,
compounding problems, not one bug — both are now resolved.

**Multi-date tracking added.** Three real dates were already
capturable but not displayed or connected: raw_news_items.posted_at
(Telegram's own message timestamp — accurate even if you fetch late),
topics.original_date (the underlying news event's date, set by
analyze-news), and a NEW column topics.approved_at (migration 018,
nullable, NOT backfilled for existing approved rows — no way to
reconstruct historical approval timestamps, a null approved_at on an
old approved row is correct/expected, not a bug). Set at approval time
in the same write as the status change.

- /topics now shows all three dates per row (batch-fetched, not N+1)
  where available: "news:", "telegram:" (only if
  source_raw_news_item_id resolves), "approved:" (only if set).
- /pipeline shows the same trail on generated runs with a linked
  topic_id (batch-fetched via a NEW two-step join this session —
  app/pipeline/page.js previously only WROTE topic_id, never read
  anything back from topics). Runs with topic_id = null (Paste Text
  mode) correctly show no topic-linked dates, handled as a normal case.
- The "Pick topic" dropdown's OPTION LIST now also shows original_date
  per option, so a topic's age is visible before selecting it, not
  just after (small follow-up fix same session).
- Confirmed: the 20 originally seeded topics (manually inserted before
  the Telegram pipeline existed) have source_raw_news_item_id = null —
  they will never show a "telegram:" date. This is correct, not a bug.

**Date filters added to /pipeline and /hooks** — date-range (from/to)
+ sort toggle (newest/oldest). On /hooks: confirmed via direct schema
read (008_hook_usage_tracking.sql, 001_alpha_schema.sql) that hooks has
NO created_at column and a random (non-sequential) UUID primary key —
meaning hooks that have never been used in a generation have
last_used_at = null and genuinely NO date to fall back to. These
correctly sort last in both directions and are excluded from an active
date-range filter, rather than faking a date.

**Archive system built** — a manual "Archive news older than 7 days"
button on /topics. Pure database date comparison
(topics.original_date < current_date - 7 days) — deliberately, explicitly
NO Anthropic API calls anywhere in this feature (an initial request
asked for an AI-driven age check; this was corrected to a free date
comparison since original_date already exists and an API call would
have been paying to re-derive a fact already in a column).

- Migration 019 added 'archived' as a 4th valid topics.status value.
  Archiving is a status flip only — NEVER a real delete, fully
  reversible.
- Real gotcha hit and fixed: migration 019 was written and committed to
  git early in the session, but NOT actually run in Supabase — the
  constraint update was skipped in the rush to test the feature. First
  attempt to archive failed with a real check-constraint violation.
  Same lesson as every prior migration this project: a migration file
  existing and being committed is NOT the same as it being applied to
  the live database — always verify via a real
  pg_get_constraintdef/information_schema query, never assume.
- Archiving only touches topics with status IN
  ('pending_review','approved') that have NO linked pipeline_runs row —
  a topic already generated from is never silently archived out from
  under existing generated content.
- Confirmed real first-run consequence: all ~20 originally seeded
  topics (original_date values from June 30–July 10) were swept up on
  the very first click, since they predate the 7-day window by months
  and have no linked runs. This is correct behavior, not a bug — they
  are now sitting in /archive, fully recoverable.
- A DEDICATED /archive page was built (app/archive/page.js) rather than
  a 4th filter pill on /topics — this was a deliberate reconsideration
  mid-session: the filter-pill approach was originally built and
  scoped, then explicitly replaced with a separate page for cleaner
  separation once discussed. /topics' filter pills remain exactly the
  original three values (approved/pending_review/rejected). /archive
  reuses the same visual row pattern as DataTable by hand (custom
  fetch with .eq("status","archived"), not a DataTable prop change —
  DataTable's core fetch logic wasn't extensible to a single extra
  WHERE clause without adding a new prop, and the brief explicitly said
  not to restructure it) and has its own "Un-archive" action
  (sets status back to pending_review). Added as a real nav entry in
  app/layout.js — this was the first direct read of that file in this
  project's history; confirmed real, uses plain <a href> tags (not
  next/link), so all nav clicks are full page reloads, consistent with
  app/page.js's same pattern noted in an earlier session.

---

## Session 7 — 7-day roadmap: grounded design docs + Codex prompts for Days 1, 2a, 3a, 3b, 5, 6, 7

_2026-07-20/21._

A 7-day feature roadmap (see 7_Day_Roadmap.md and Ideas.md, both
committed to the repo root) was planned in a separate planning
conversation, then handed off for implementation via Codex, following
a real engineering workflow shared by the project's other stakeholder
(Harish) — full detail of that workflow is in the repo's own
docs/design/ files and the H10-style prompt structure adopted from it.

**Process adopted, matching Harish's own working method:**
- Every implementation task gets a real design doc first
  (docs/design/DAYx_DESIGN.md), grounded by actually reading the real
  current files it touches — never written from memory or from
  CONTEXT.md's prose alone. Multiple days required 2-3 rounds of "read
  this real file first" before the design doc could be trusted (Day 1
  needed lib/tierColor.js, app/hooks/page.js, app/import-review/page.js,
  app/hook-performance/page.js all read directly before §6/§7 could be
  written correctly; Day 3's kanban/next-best-idea items were
  discovered to depend on the topic_id linking fix and were split into
  their own Day 3b once that was confirmed working).
- Every design doc has a matching Codex goal-prompt, H10-style: exact
  files to read first, "operator decisions already approved" (so Codex
  never re-litigates things already decided), explicit non-goals,
  concrete acceptance criteria, a "push back on the brief" section.
- Every prompt ends with an IMPROVEMENT LICENSE clause (added mid-
  roadmap, applies to all 7 days): Codex may build genuine improvements
  beyond what's scoped, not just flag them — with two hard rules: never
  reopen/override anything in "operator decisions already approved" or
  the explicit non-goals list (those go in the report as a suggestion,
  not into code), and every self-initiated improvement commits
  separately, labeled "IMPROVEMENT (not in original brief): ..." so a
  human reviewer can accept/reject it independently from the scoped
  task.
- Nothing Codex builds gets pushed or merged by Codex itself — commits
  to its own branch and stops; a human (or a Claude Code session)
  reviews the real diff, pushes, and opens the PR. This mirrors the
  session's own long-standing discipline (never trust a summary,
  always get the real artifact) applied to a second AI agent, not just
  the first.

**Real bugs found and fixed WHILE grounding the roadmap** (i.e., before
any Codex prompt was even written — this is the same "verify before
building" discipline the project already had, just applied one level
earlier, at the planning stage):
- pipeline_runs.topic_id FK type mismatch (topics.id uuid vs bigint) —
  fixed, migration 016. Confirmed via live query that all 31 existing
  runs had topic_id = null before the fix (no data lost).
- app/pipeline/page.js was calling Number(topicId) on a UUID string,
  silently producing NaN → null on every request — meaning topic
  linking never worked from the UI even before the schema was wrong.
  Fixed same session as the FK fix. Confirmed working end-to-end via a
  real generate call showing a populated topic_id.
- SESSION_SUMMARY.md (a separate, undiscovered file containing real
  Session 2 detail not folded into CONTEXT.md) was found and merged in
  as the "Session 2" section above; the original file archived to
  archive/SESSION_SUMMARY.md.
- CLAUDE.md and AGENTS.md were confirmed to be generic Next.js
  boilerplate, not project-specific instructions — noted as a real gap
  in Harish's six-file convention (README/CLAUDE.md/AGENTS.md/context.md/
  .gitignore/.env.example) that this project hasn't fully adopted yet;
  not fixed this session, flagged for later.

**Design docs + Codex prompts completed this session** (all committed
to docs/design/):
- **Day 1 — Command Center:** Real "Today" home page, cross-app "needs
  attention" counter, status colors extended (not duplicated) in
  lib/tierColor.js, aggregate-only content journey tracker. Nav
  consolidation (originally roadmap item 5, folding /import-review and
  /hook-performance into /hooks) was explicitly SPLIT OUT and deferred
  — reading the real files showed both are fully custom pages sharing
  nothing with DataTable, making this a real restructure, not a
  Day-1-sized addition. NOT YET SENT TO CODEX/BUILT as of end of this
  session — still just a reviewed, ready design doc + prompt.
- **Day 2a — Review speed:** Two-pass triage, keyboard-first review
  (A/R/S + arrows), structured rejection reasons (7 fixed values,
  new topics.rejection_reason column + check constraint), reusing the
  existing "Raw messages" section's UI pattern rather than touching
  DataTable.js. Pairwise review, approval snapshots, and expiry
  deadlines were split into a deferred Day 2b (not designed this
  session). Claim-diffing on regeneration was confirmed BLOCKED, not
  just deferred — Pipeline has no regeneration feature at all, every
  Generate click creates a brand new row, confirmed via full direct
  read of app/pipeline/page.js. NOT YET SENT TO CODEX/BUILT.
- **Day 3a — Pipeline items independent of topic linking:** In-place
  editing of script segments/hooks/titles (whole-jsonb-column read/
  mutate/write, never a partial patch), date-based (not usage-based)
  staleness flag on approved topics, on-demand-only "Suggest platform"
  action. NOT YET SENT TO CODEX/BUILT.
- **Day 3b — Topic-linked Pipeline features:** Script history grouped
  by topic, "next best idea" suggestion (approved topic, zero linked
  runs, highest score), read-only 4-lane kanban board (Idea/Scripted/
  Reviewed/Posted — explicitly NO "Ready to Film" lane, no such status
  exists in the real schema, roadmap's original wording was wrong).
  Depended on and is now unblocked by the topic_id fixes above.
  NOT YET SENT TO CODEX/BUILT.
- **Day 5 — Real intelligence, ingestion only:** New migration 017,
  source_items table — a NEW, separate, source-agnostic staging table
  for non-Telegram ingestion (changelogs, MCP scout, etc.), since
  raw_news_items' bigint Telegram-specific ID columns don't generalize.
  topics gained a second nullable FK, source_item_id (alongside the
  existing source_raw_news_item_id — a topic traces to exactly one of
  the two, enforced at the application level not a DB constraint).
  analyze-news's request shape changes from
  { rawNewsItemIds: [...] } to { items: [{id, table}] } so it can read/
  write correctly across both source tables. Migration 017 IS APPLIED
  (confirmed via live schema query, 8 real columns present). Scope for
  this pass: ONE new source (a changelog watcher polling Anthropic/
  OpenAI/Vercel/Cursor) — momentum scoring, cross-source convergence,
  MCP scouting, and Grok/xAI integration all explicitly deferred, since
  none of them mean anything with only one or zero non-Telegram sources
  actually running yet. Prompt-injection quarantine (treating scraped
  content as untrusted before it reaches a Claude call) was flagged as
  a real, relevant gap but deliberately scoped as its own future design
  doc, not bundled in here. NOT YET SENT TO CODEX/BUILT.
- **Day 6 — Close the loop, explicitly narrow "done":** /analytics is
  confirmed still empty/near-empty. This doc's Definition of Done
  means "runs correctly against zero/sparse rows," NOT "proven correct
  against real outcomes" — stated explicitly so this distinction can't
  get blurred later. Topic-performance audit page (parallel to the
  existing hook-performance pattern), weekly-recap route (must detect
  insufficient data in code BEFORE calling Claude, never let the model
  fabricate insight from 0-1 data points), and only the data-plumbing
  prerequisite for future score-calibration — the actual calibration
  logic is explicitly NOT built, deferred until real volume exists.
  Small bundled fix: the /analytics pipeline-run dropdown now shows the
  linked topic's title, not just the run's own title. NOT YET SENT TO
  CODEX/BUILT.
- **Day 7 — Polish, one combined doc** (unlike every other day's
  splits — genuinely low-risk across the board, no real blocker
  justified splitting it): dismissible first-time walkthrough
  (localStorage — confirmed fine to use here since this is a real
  deployed page, not a sandboxed artifact context), hover explainers on
  badges (one shared constant file, not per-page duplication), a
  READ-ONLY settings page (explicitly NOT editable in this pass — the
  niche description and scoring thresholds are hardcoded constants/
  prose text, not DB rows; a real editable version needs its own future
  design decision about a config table vs. editing source files from a
  UI), page-specific empty states, and a new activity_log table +
  non-fatal logging calls at existing write points. Confirmed real
  pre-existing inconsistency to surface honestly on the settings page:
  NICHE_DESCRIPTION exists only in analyze-news/route.js, generate/
  route.js has no equivalent constant at all. NOT YET SENT TO CODEX/
  BUILT.

### Immediate open items, updated priority order (end of Session 7)

1. **None of Days 1, 2a, 3a, 3b, 5, 6, 7's design docs have actually
   been sent to Codex or built yet** — all seven are fully grounded,
   reviewed, and paired with ready Codex prompts, sitting in
   docs/design/. This is the actual next step whenever building
   resumes.
2. Corpus is STILL 0 rows — still the single highest-priority gap,
   unchanged across every session so far.
3. Whether the "Cron Jobs" Telegram group is the final intended
   production source or a standing test setup — still unconfirmed.
4. xAI/Grok integration — still deferred, not scheduled in any grounded
   design doc yet.
5. Nav consolidation (/import-review, /hook-performance into /hooks) —
   still deferred pending its own dedicated design pass; real
   complexity confirmed, not just assumed.
6. Prompt-injection quarantine for scraped content reaching Claude
   calls — flagged as a real gap, not yet designed.
7. CLAUDE.md/AGENTS.md are still generic boilerplate, not
   project-specific — Harish's six-file convention isn't fully adopted.
8. Whether topics.score should become a real column (vs. the current
   text-parsing of "Score: N/10" out of ai_reasoning) — raised as an
   open question in the Day 3b/Day 6 design docs, never explicitly
   decided either way.
