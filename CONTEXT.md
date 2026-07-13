> **Living document rule:** This file must be updated, not left stale. At the end of any session that changes architecture, adds a module, makes a vendor/schema decision, or resolves one of the "Known gaps" below — update the relevant section before ending the session and commit `CONTEXT.md` alongside the code change in the same commit.

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

8. **Migration 009 pending apply** — `007` and `008` are confirmed applied to the live database (tier constraint and `times_used`/`increment_hook_usage` verified in production). Only `009_import_review_queue.sql` remains to be run. Until it is applied, `/import-review` and `POST /api/import-hooks` will fail (`import_review_queue` table and `find_similar_hooks` RPC do not exist).

9. **Supabase SQL editor silent failure (operational watch)** — This project's SQL editor has repeatedly reported "Success. No rows returned" for `ALTER TABLE`, `CREATE FUNCTION`, and `UPDATE` statements run in isolation, without the change actually landing — confirmed by a subsequent `SELECT` in a separate execution showing no change. Always pair a write with a verifying `SELECT` in the same execution block (e.g. `ALTER TABLE ...; SELECT column_name FROM information_schema.columns WHERE table_name = 'hooks';`). Do not trust a bare success message for schema or data changes.

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
| `009_import_review_queue.sql` | **Pending apply** | Enables `pg_trgm`; adds GIN trigram index on `hooks.hook_text`; creates `import_review_queue` table and `find_similar_hooks(query_text, threshold)` RPC |
| `011_topics_original_date.sql` | Applied | Adds `original_date date` (nullable) to `topics`; wired into `POST /api/import-topics` |
| `012_selected_hook_tier.sql` | Applied | Adds `selected_hook_tier text` (nullable) to `pipeline_runs`; saved at approval time |
| `013_hook_transforms.sql` | Applied | Creates `hook_transforms` table (`source_hook_id` → `hooks`, `target_platform`, `transformed_text`); GIN lookup index; RLS open policy |

---

## 9. Operational findings

Things learned in practice that aren't derivable from the code but are worth preserving for future sessions.

**Supabase SQL editor silent failure:** The SQL editor has intermittently reported "Success, no rows returned" for write statements that did not actually commit. Pairing a write with a verifying `SELECT` in the same execution (e.g. `UPDATE ...; SELECT count(*) FROM hooks WHERE evidence_tier = 'SOURCED UNVERIFIED';`) reliably surfaces the true state. Do not trust "Success" alone for schema changes or data migrations.

**Hook bank text fields contain descriptive suffixes:** The original `master_hook_bank.xlsx` data has evidence_tier values like `NOT CONFIRMED (0-3)`, `VERIFIED 3-0 across multiple niches`, `REFUTED 10/10`, etc. Migration 007 handles this with LIKE-pattern UPDATEs. The same pattern may apply to other text columns (`category_pattern`, `mechanism`, `creator_archetype`) — verify before assuming exact-match filtering will work on any column sourced from the original spreadsheet.
