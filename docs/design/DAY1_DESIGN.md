# Design Doc — Day 1: The Command Center (v3)

_Status: draft, awaiting human review before any Codex run. Not applied._
_References real code as of commit `91ee48f` (main, post CONTEXT.md merge)._
_Real files read for this revision: `lib/tierColor.js`, `app/hooks/page.js`,
`app/import-review/page.js`, `app/hook-performance/page.js`. `app/layout.js`
confirmed to exist at `./app/layout.js` but not yet read — see §6._

---

## Revision notes (v3)

1. `lib/tierColor.js` read directly. `topicStatusColors` is already
   correctly updated for Session 4's status values, with the old
   values kept as an explicit, commented legacy fallback. No bug —
   v2's caution here was warranted but the fix already exists.
2. Real color values are now known and stated as fact below, not
   flagged for re-verification.
3. **Scope change:** item 5 (nav consolidation) is pulled out of Day 1
   entirely and moved to its own follow-up task (§7). Reading the real
   `/import-review` and `/hook-performance` pages showed this is a
   restructure of two fully custom, independently-built pages — not a
   quick "add tabs" job. Doing it alongside five other new-build items
   raises the chance of regressing something that already works. If you
   want it back in Day 1, say so — this is a judgment call, not a hard
   constraint.
4. `pipeline_runs.status` is now partially confirmed —
   `app/hook-performance/page.js` filters on
   `.in("status", ["approved", "published"])`, so those two values are
   real. The pre-approval/draft value is still unconfirmed — §2 updated
   to ask for both a schema check and a distinct-values check.

---

## §1. Problem statement

`app/page.js` is a static array (`MODULES`) of seven hardcoded links
with hand-written description text, rendered via plain `<a href>` tags —
not `next/link`. Every navigation from this page is a full page reload,
not a client-side transition. Relevant later (§5) when deciding how data
should be fetched.

The page has no data fetching and no awareness of what's pending
anywhere else in the app. `components/DataTable.js` fetches exactly one
table per instance — it cannot be reused for a cross-module dashboard.

## §2. Confirmed facts (safe to build on directly)

**Colors, from the real `lib/tierColor.js`:**

```js
green: { border: '#4C9A6A', text: '#5FA97D' }
amber: { border: '#C98A3E', text: '#D9A257' }
red:   { border: '#B4483F', text: '#C96158' }
gray:  { border: '#7C8489', text: '#7C8489' }
```

Both `tierColors()` and `topicStatusColors()` already live in this one
file, sharing this same internal `COLORS` object. Extend this file; do
not create a parallel one.

**`topicStatusColors()` already handles the real, current status values**
(`approved`/`pending_review`/`rejected`) correctly, with `new`/`reviewed`
kept only as an explicit legacy fallback. Confirmed by direct read — no
further verification needed here.

**Card/row styling**, confirmed directly from `components/DataTable.js`:
background `#171D21`, border `#232B31`, muted text `#7C8489`, monospace
font `var(--font-ibm-plex-mono)` for labels/metadata.

**Real `pipeline_runs.status` values in active use:** `"approved"` and
`"published"`, confirmed via `app/hook-performance/page.js`'s own query
filter. The pre-approval/default value is NOT yet confirmed.

## §3. Still needs a live check before writing `fetchDashboardCounts()`

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'pipeline_runs'
ORDER BY ordinal_position;

SELECT DISTINCT status, count(*) FROM pipeline_runs GROUP BY status;
```

Run both, paste real results into the PR. The second query matters
because a text column's schema doesn't reveal which values are actually
in use — §2 already found two real values from other code, but not the
one this feature actually needs (the pre-approval/"draft" state).

## §4. Scope (Day 1 proper)

In scope:
1. Real "Today" home page replacing the static `MODULES` grid.
2. A single "what needs me" counter — see §5 for exact definition and
   an open question on "click it, go to the first item."
3. Status colors extended in `lib/tierColor.js` (exact code in §6),
   applied to the new home page, and to `/topics` as a one-page proof —
   **before editing `app/topics/page.js`, read its current
   `getRowColors`/`tierKey` props directly; they have not been read in
   this design process, only inferred from `DataTable.js`'s generic
   interface.** Cheap check, do it before assuming.
4. Aggregate-only content journey tracker on the home page — see §8 for
   why per-item tracking is currently blocked, not just deferred.
5. Explicit, warm "you're all caught up" empty state — copy in §5.

Explicitly NOT in scope for Day 1 (see §7): folding `/import-review` and
`/hook-performance` into `/hooks`.

Out of scope entirely: any Day 2–7 item, `app/api/generate/route.js`,
any migration, any change to `components/DataTable.js`.

## §5. `app/page.js` behavior, precisely

**Be honest about what the counter represents.** `pendingTopics` and
`draftRuns` are genuinely "waiting on a decision." `unprocessedNews` is
material waiting to be *processed*, not a decision itself. Don't blur
these:

- One large number: `pendingTopics + draftRuns`, labeled "needs your
  decision."
- A separate, visually secondary line: "N new items to process" for
  `unprocessedNews`.

**Open question — resolve explicitly, don't default silently:**
clicking the big number should go "straight to the first one," per the
roadmap's own wording — not just to a list page. Define "first": oldest
by `date_added`/`created_at`, or highest-scored (topics from the
analyze-news pipeline carry a score)? Pick one, state it in the PR.

**Empty state copy** (adjust freely, keep this plain/warm register):

> "You're all caught up. Nothing waiting on you right now."

Secondary line if there's unprocessed news but no decisions pending:

> "N new items came in — run them through when you get a chance."

**Loading state:** simple text placeholder, not a blank page.
**Error handling:** each count fails independently; one broken query
shows an error on that one line, not the whole page.
**No polling/auto-refresh** in this pass — fetch on load is enough.

## §6. New/changed files

### `lib/tierColor.js` — add these exact functions, reusing the existing `COLORS` object

```js
export function rawNewsItemStatusColors(status) {
  if (!status) return COLORS.gray;
  switch (status.toLowerCase()) {
    case 'processed': return COLORS.green;
    case 'unprocessed': return COLORS.amber;
    case 'ignored': return COLORS.gray;
    default: return COLORS.gray;
  }
}

export function pipelineRunStatusColors(status) {
  if (!status) return COLORS.gray;
  switch (status.toLowerCase()) {
    case 'approved':
    case 'published': return COLORS.green;
    // draft/pre-approval value: confirm via §3's live query before
    // adding its case here — do not guess it.
    default: return COLORS.amber;
  }
}
```

Do not change `tierColors` or `topicStatusColors`'s existing signatures —
additive only.

### `app/page.js` — full rewrite, becomes a Client Component

Matches every other page in this app (`topics`, `hooks`, `corpus`,
`pipeline`, `analytics` are all already `"use client"` for the same
reason — hooks + function props). Considered and rejected: Server
Component + service-role fetch, for consistency with the established
pattern, and because navigation already full-reloads regardless (§1),
so there's no freshness win to justify the inconsistency.

### `lib/dashboardQueries.js` — new file

```js
const { count } = await supabase
  .from(table)
  .select('*', { count: 'exact', head: true })
  .eq(column, value);
```

Standard, stable Supabase JS client API — safe to use directly. Returns
`{ pendingTopics, unprocessedNews, draftRuns }` — do not pre-sum these
inside this function; §5 needs them separate for honest labeling.

### `components/DashboardCard.js` — new component

Takes `{ label, count, href, border, text }` — reuse the
`{ border, text }` shape every existing color function already returns
(`tierColors`, `topicStatusColors`, and the two new functions above),
rather than inventing a separate "tone" enum that would just duplicate
the same information.

## §7. Deferred: nav consolidation (was item 5)

Pulled out of Day 1 — see revision note 3. What's already known, so this
doesn't need re-research when picked up later:

- `/import-review` (`app/import-review/page.js`) is a fully custom page:
  its own CSV parser, its own upload UI, its own `QueueRow` component
  with tier badges — none of it goes through `DataTable`. It reads/
  writes `import_review_queue` (status values: `pending`,
  `resolved_kept_existing`, `resolved_added_incoming`, and separately
  `duplicate_skipped` for audit).
- `/hook-performance` (`app/hook-performance/page.js`) is also fully
  custom: its own `useEffect` fetch, its own JS-side join of
  `pipeline_runs` to `analytics`, its own tier-ranking sort, a custom
  grid layout — also nothing shared with `DataTable`.
- `/hooks` itself (`app/hooks/page.js`) has zero tab-switching
  mechanism today — one `DataTable` instance plus a `renderRowFooter`
  for the platform-transform feature.
- Merging these three into tabs means either building a real tab
  container from scratch, or rewriting two working custom pages to fit
  a shape they weren't built for. Worth its own design doc, not a Day 1
  add-on.
- `app/layout.js` (confirmed to exist, not yet read) will need reading
  when this task is actually picked up, to see how nav links are
  currently defined/removed.

## §8. Why the content-journey tracker is aggregate-only — a blocker, not a preference

CONTEXT.md §5 (Known gaps, item 5) documents an existing, unresolved
issue: `topics.id` is `uuid`; `pipeline_runs.topic_id` is `bigint`. Topics
cannot currently be reliably joined to their pipeline runs. A true
per-item tracker (Idea → Approved → Scripted → Reviewed → Posted →
Logged) requires exactly that join. Day 1 builds aggregate stage counts
only — not because it's simpler, but because per-item tracking would
silently return wrong or empty data until the FK mismatch is fixed as
its own task first.

## §9. Explicit non-goals for Day 1

- No changes to `components/DataTable.js`.
- No new migrations.
- No status-badge retrofit on `/hooks`, `/corpus`, `/pipeline`,
  `/analytics` — `/topics` only, as the proof page.
- No nav consolidation (§7).
- No fix to the `pipeline_runs.topic_id` FK mismatch.
- No polling/real-time behavior.

## §10. Acceptance criteria (Definition of Done)

1. `app/page.js` no longer contains the static `MODULES` array.
2. §3's two live queries were run; real results quoted in the PR.
3. `app/topics/page.js`'s actual current `getRowColors`/`tierKey` props
   were read before editing — quote them in the PR.
4. Fresh state (0/0/0) shows the exact empty-state copy from §5.
5. Real pending data shows the decisions-needed / items-to-process
   split from §5, correctly and separately labeled.
6. The "click → go to first item" question has a stated, explicit
   answer in the PR — not a silent default.
7. `lib/tierColor.js` gained exactly the two new functions in §6,
   additive only — existing exports unchanged.
8. No changes to `components/DataTable.js`, no migrations, no changes
   to `app/api/generate/route.js`, no changes to `/import-review` or
   `/hook-performance`.

## §11. Push back on this brief

If §3's live query shows `pipeline_runs.status` has more complexity than
a simple approved/published/draft split (e.g. multiple in-progress
states), say so and propose the simplest honest grouping rather than
forcing a three-way split. If reading `app/topics/page.js` reveals it
already has some status-color handling this doc doesn't know about,
point to it and do less work, not more.

---

_Suggested housekeeping, not required for Day 1: this file currently
lives outside the actual git repo. Harish's own convention
(`docs/design/H10_OFFHOST_BACKUP_DESIGN.md`) puts design docs inside the
repo under `docs/design/` — worth moving this and future design docs
there once this workflow is adopted, so they're versioned alongside the
code they describe._
