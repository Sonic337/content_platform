> **Living document rule:** This file must be updated, not left stale. At the end of any session that changes architecture, adds a module, makes a vendor/schema decision, or resolves one of the "Known gaps" below — update the relevant section before ending the session and commit `CONTEXT.md` alongside the code change in the same commit.

---

# Content Ops Platform — Project State

_Last updated: 2026-07-12_

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

Ink-dark fixed theme (`#10151A` background, `#E8E6DE` foreground). Evidence-tier identity is communicated via 3px left-border color stripes on list rows (green = VERIFIED, amber = SOURCED/UNVERIFIED, red = NOT CONFIRMED), not badges. Body text in Fraunces serif; metadata in IBM Plex Mono. This is a deliberate choice tied to the evidence-graded research subject matter. Do not "improve" it toward generic SaaS styling without flagging that as a real design change, not a bug fix.

Color constants live in `lib/tierColor.js`:
- `tierColors(evidenceTierStr)` → `{ border, text }` for hook evidence tiers
- `topicStatusColors(statusStr)` → `{ border, text }` for topic statuses (new = green, reviewed = amber)

---

## 3. Module status

### Topics feed (`app/topics/page.js`, table: `topics`)

**Status: built, placeholder data only.**

DataTable with filter by status, add-row form. Fields: title, summary, source_name, source_url, tags, status.

**Hermes integration is intentionally deferred.** Hermes is a separate Telegram cron agent that pulls 10–20 sources daily. It will eventually write directly to the `topics` table via Supabase REST. For now, the table is manually seeded. This is a deliberate decision — wiring Hermes before the pipeline is stable would create noise.

### Hook bank (`app/hooks/page.js`, table: `hooks`)

**Status: built, real data.**

117 rows imported from `master_hook_bank.xlsx` via Supabase CSV import. Schema matches the spreadsheet column-for-column (`hook_text`, `platform`, `category_pattern`, `creator_archetype`, `mechanism`, `evidence_tier`, `source_report`, `notes`). Evidence tier values: `VERIFIED 3-0`, `VERIFIED 2-1`, `SOURCED, UNVERIFIED`, `NOT CONFIRMED`.

The pipeline's `fetchHooks()` fetches the top 40 by platform match, keyword-scores them across `category_pattern + hook_text + mechanism + notes`, sorts by score then VERIFIED tiebreaker, takes top 5, and backfills from any-platform VERIFIED hooks if needed.

### Writing corpus (`app/corpus/page.js`, table: `corpus`)

**Status: built, EMPTY.**

DataTable + bulk import panel (paste multiple pieces separated by `---` lines; title derived from first line ≤80 chars; all pieces inserted in one Supabase `.insert()` call). The `key={tableKey}` prop bump on DataTable forces a re-fetch after import.

**This is the single highest-priority gap.** The pipeline's `buildSystemPrompt()` includes a "VOICE & STYLE REFERENCE" block built from corpus samples. Until real past writing (captions, scripts, notes) is bulk-imported here, the AI has no actual voice grounding. This is a manual task for the human operator — paste past content into the bulk import UI.

### Pipeline (`app/pipeline/page.js`, `app/api/generate/route.js`, table: `pipeline_runs`)

**Status: built and functional.**

**UI:** Platform select (tiktok / instagram_reels / youtube_shorts / x / linkedin), optional duration input, optional topic link, Generate button. Runs are displayed as timestamped script beats (Fraunces serif for beat text, mono for timestamp + label). Hook and title selections are saveable. Approve → publishes the run (sets `status = 'published'`).

**Generation flow (`POST /api/generate`):**
1. Extract keywords from `input_text` (stopword-filtered)
2. Parallel fetch: `fetchHooks()`, `fetchCorpus()`, `fetchVisualPatterns()` — all keyword-ranked
3. Build system prompt with HOOK BANK + VOICE & STYLE REFERENCE + VISUAL PATTERNS blocks
4. `claude-sonnet-5` → parse JSON response (separate try/catch from API call)
5. Guard: do not insert if `script_segments`, `hook_options`, or `title_options` are missing
6. Build `thumbnail_prompt` using top title + opening beat + top visual pattern (if any)
7. `fal-ai/flux/dev` thumbnail generation (non-fatal — pipeline succeeds even if thumbnail fails)
8. Insert `pipeline_runs` row

**Response shape (Anthropic must return exactly this):**
```json
{
  "script_segments": [{"start_sec": 0, "end_sec": 5, "label": "hook", "text": "..."}],
  "hook_options": [{"hook_text": "...", "source": "bank"}],
  "title_options": ["...", "...", "..."]
}
```

`script` (plain-text concatenation of all segments) is also stored as a fallback/search field.

**Schema note:** `pipeline_runs.topic_id` references `topics.id` but `topics` uses `uuid` PK and `pipeline_runs` was created with `bigint` FK — this mismatch exists in the live DB. Currently nullable so it doesn't block inserts (topic linking not wired in the UI yet).

### Visual patterns (table: `visual_patterns`)

**Status: table exists, EMPTY.**

Used by `fetchVisualPatterns()` in the generate route to ground thumbnail prompts and script visual cues. Migration 005 (reference only, already applied) adds this table. Will be seeded from the pending thumbnail/visual pattern research report.

### Analytics (`app/analytics/page.js`, table: `analytics`)

**Status: built, no data yet.**

DataTable with filter by platform, add-row form. Columns displayed: platform, views, likes, comments, posted_at. Full form fields: platform, post_url, posted_at, views, likes, comments, shares, saves, avg_watch_time_sec, retention_pct (all numeric — coerced via `DataTable`'s `numeric` field type), notes, plus a pipeline_run_id selector (fetches last 20 runs, labeled by `selected_title` or first 60 chars of script). `pipeline_run_id` is optional/nullable.

---

## 4. Environment variables

| Variable | Where used | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/supabaseClient.js`, `lib/supabaseServer.js` | Supabase project URL — safe to expose to browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabaseClient.js` only | Publishable/browser key — safe to expose |
| `SUPABASE_SECRET_KEY` | `lib/supabaseServer.js` only | Service-role key — **never expose to browser**, server-only |
| `ANTHROPIC_API_KEY` | `app/api/generate/route.js` only | Anthropic API key — server-only |
| `FAL_KEY` | `app/api/generate/route.js` only | fal.ai API key — server-only |

---

## 5. Known gaps (priority order)

1. **Corpus is empty** — No voice/style grounding for the pipeline until the human bulk-imports real past writing via the corpus page. Everything else is blocked on this for quality output.

2. **Visual patterns table is empty** — Thumbnail grounding falls back to a generic "cinematic, high-contrast" prompt. Unblocked by the pending visual pattern research report (see §6).

3. **Topics table is manually seeded** — No live signal from Hermes yet. Deferred by design until the pipeline is stable and the Hermes integration is scoped.

4. **Analytics has no data** — Baseline comparisons require logged posts. Will accumulate naturally as the team publishes and enters rows manually.

5. **`pipeline_runs.topic_id` FK type mismatch** — `topics.id` is `uuid`, the FK column is `bigint`. Currently nullable so it's not blocking, but topic linking can't be properly wired until this is resolved (either change `topics` PK to bigserial or change the FK column to `uuid`).

6. **No embeddings** — Vector columns exist on `hooks`, `corpus`, `topics`. Semantic search is deferred; keyword ranking is the current retrieval strategy.

7. **RLS is open** — `for all using (true)` policies are appropriate for single-team alpha. Tighten before granting external agent write access.

---

## 6. Pending external work

Four research reports commissioned via Claude Opus deep research, not yet returned. Each will arrive as a PDF.

| Report | What it will unblock |
|---|---|
| Short-form script pacing / beat-length research | Refine `script_segments` prompt logic in `buildSystemPrompt()` — currently the segment count and beat labels are heuristic. Real research on optimal beat durations per platform will let us tighten the duration guidance. |
| 20–30 real dated content topics | Seed the `topics` table with actual recent AI/tech topics via CSV import. Fixes the "manually seeded" gap immediately. |
| Thumbnail / visual pattern research | Seed the `visual_patterns` table (same import workflow as `master_hook_bank.xlsx` → hooks). Fixes the empty visual patterns gap; thumbnail prompts will have real grounding. |
| Platform performance benchmarks | Provide a comparison baseline once `analytics` has real logged data. Will also inform what metrics to prioritize in the analytics view. |

---

## 7. DataTable component notes

`components/DataTable.js` is a generic shared component used by all five module pages. Key behaviors:

- Fetches its own data on mount (and on `filterValue` change) using the browser Supabase client
- `key` prop bump on the parent forces remount + re-fetch (used by corpus bulk import)
- `extraPayload = {}` prop is merged into the insert payload (used by analytics to inject `pipeline_run_id`)
- Field types in `formFields`: `text`, `textarea`, `select` (needs `options: []`), `tags` (comma-separated string → array on submit), `numeric` (`<input type="number">` → `Number()` coercion on submit)
- `bodyKey`: column rendered as Fraunces serif body text
- `tierKey`: column rendered with `getRowColors(row).text` accent color
- `getRowColors(row)`: function returning `{ border, text }` for the 3px left stripe and tier text

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
