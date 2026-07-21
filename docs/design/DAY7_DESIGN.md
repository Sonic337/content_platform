# Design Doc — Day 7: Polish Until It's Foolproof

_Status: draft, awaiting human review before any Codex run. Not applied._
_References real code confirmed across Days 1-6's grounding work:
app/page.js, app/topics/page.js, app/pipeline/page.js,
app/analytics/page.js, app/hooks/page.js, lib/tierColor.js,
components/DataTable.js, app/api/analyze-news/route.js,
app/api/generate/route.js._

---

## §1. Why this is one combined doc, unlike prior days

Every prior split (Day 1's nav-merge, Day 2's schema-dependent items,
Day 3's topic-linking dependency) was driven by a real blocker or a
genuine risk-of-regression concern. Day 7 has neither — it's mostly
small, additive, low-risk changes spread across pages already read in
full during Days 1-6's grounding work. Bundling it is the honest choice
here, not a shortcut.

## §2. Confirmed real state relevant to this doc

- `NICHE_DESCRIPTION` is hardcoded in `analyze-news/route.js` only —
  `generate/route.js` has no equivalent constant at all. This is a
  real, pre-existing inconsistency, not something this doc's settings
  page should paper over (§5).
- The scoring thresholds (6=pass, 4-5=borderline, ≤3=fail) live inside
  `CONTENT_REVIEW_SKILL`, a large inlined template string in
  `analyze-news/route.js` — not a simple config value, a value embedded
  inside prose the model reads. Changing this isn't a form field
  writing to a number column; it's editing text inside a larger
  instruction block. Scope the settings page's relationship to this
  value carefully (§5) — don't overpromise "editable thresholds" if the
  real mechanism is this entangled.
- Connected sources, confirmed real and current: Telegram webhook,
  Telegram group fetch, and (once Day 5 lands) changelog watching. A
  settings page listing "connected sources" should reflect these three,
  not an imagined larger list.
- No activity-log mechanism exists anywhere today — every status change
  (approve, reject, generate, publish) happens via direct Supabase
  writes from page components, with nothing recording "what happened"
  as its own event. Building a real activity feed means adding logging
  calls at each of these existing write points, not querying something
  that already implicitly exists.

## §3. Item — first-time walkthrough

A dismissible checklist card on the home page (`app/page.js`, built in
Day 1): "1. Check your new ideas. 2. Approve the good ones. 3. Generate
a script. 4. Review it. 5. Go film." Persist dismissal in browser
`localStorage` — **note: this project's artifact/component conventions
elsewhere explicitly avoid browser storage APIs in some contexts (per
general project tooling constraints), but this is a real deployed Next.js
page, not a sandboxed artifact, so localStorage is fine here.** Confirm
this distinction is understood before building, since conflating the
two could lead to skipping a legitimate, simple solution unnecessarily.

## §4. Item — hover explainers

Add a small `title` attribute (native browser tooltip, simplest correct
choice, no new dependency) to every score/tier/status badge across
`/topics`, `/hooks`, `/hook-performance`, and Day 6's
`/topic-performance` — one plain-English sentence per badge type,
sourced from a single new constant (e.g. `lib/badgeExplainers.js`) so
the wording lives in one place, not copy-pasted per page.

## §5. Item — settings page

### New page: `app/settings/page.js`

Given §2's finding about how entangled the real "thresholds" are with
prose text, scope this honestly:

- **Read-only display, not an editable form, for this pass:** show the
  current niche description (from `analyze-news/route.js`'s constant —
  note inline in the UI that `generate/route.js` doesn't share this
  value, surfacing the real inconsistency rather than hiding it), the
  current scoring thresholds (6/4/3, described in plain language, not
  as editable number fields), and the three real connected sources
  (§2).
- **Explicitly do not build inline editing of these values in this
  pass** — the niche description and thresholds are currently code
  constants, not database rows; making them genuinely editable would
  mean either a real config table (a small migration) or editing source
  files from a web UI (a much bigger, riskier feature). Flag this
  clearly as a future decision point rather than quietly building a
  half-working editor.

## §6. Item — real empty states

Audit every page's "no rows" state (`DataTable.js`'s existing generic
message: "No rows yet. Connect Supabase env vars and run the migration,
or add one above.") — this generic message is technically accurate but
unhelpful on pages where the real reason for zero rows is something
else (e.g. `/topics` with zero pending review items, `/analytics` before
anything's been posted). Add page-specific empty-state copy via
`DataTable`'s existing extensibility (check whether a custom empty-state
override already fits the current prop interface, or whether this needs
one small new prop — read the current `DataTable.js` source directly
before deciding, since it's been a few days since Day 1's read of that
file and it may have changed).

## §7. Item — activity log

### New table, migration (write only, do not run)

```sql
create table if not exists activity_log (
  id          uuid        primary key default gen_random_uuid(),
  event_type  text        not null,  -- 'topic_approved' | 'topic_rejected' | 'script_generated' | 'run_published' | etc — extend freely
  summary     text        not null,  -- one-line plain-English description, e.g. "Approved: <title>"
  related_id  uuid,                  -- the topic/run id this event concerns, nullable, no FK constraint (deliberately loose — this log spans multiple tables, a strict FK would need a table per event type)
  created_at  timestamptz not null default now()
);

alter table activity_log enable row level security;
create policy "open" on activity_log for all using (true);
```

### Logging calls

Add a small `logActivity(eventType, summary, relatedId)` helper
(`lib/activityLog.js`), and call it at each existing write point this
doc has confirmed exists: topic approve/reject (`app/topics/page.js`),
script generation success (`app/api/generate/route.js`'s insert),
run status changes (`app/pipeline/page.js`'s `updateRun`). Each call is
non-fatal — logging failure should never block the actual action it's
logging (same non-fatal pattern already used for hook-usage increments
in `generate/route.js`).

### UI

A simple reverse-chronological list on the home page (or a small
dedicated `/activity` page — pick whichever fits better once the home
page's actual Day 1 layout is checked, don't assume a shape without
looking).

## §8. Explicit non-goals for Day 7

- No inline editing of niche description or thresholds (§5) — read-only
  display only.
- No changes to `components/DataTable.js` beyond a possible small,
  additive empty-state override prop (§6) — confirm current file state
  before deciding if this is even necessary.
- No retroactive activity-log backfill for past actions — the log
  starts recording from whenever this ships forward, not before.
- No real-time/live-updating activity feed — a page that fetches on
  load is sufficient, matching every prior day's "no polling" decisions.

## §9. Acceptance criteria

1. The walkthrough checklist appears for a fresh session, dismisses
   correctly, and stays dismissed on reload (real localStorage check,
   not just visual confirmation).
2. Hover explainers appear on real badges across all four pages listed
   in §4, sourced from the single shared constant — confirm no
   duplicated explainer text exists across files.
3. `/settings` shows the real current niche description, the real
   inconsistency with `generate/route.js` noted, real thresholds in
   plain language, and the real three connected sources — no invented
   or placeholder content.
4. Empty states are page-specific and honest, not the generic DataTable
   fallback, on at least `/topics` and `/analytics`.
5. `activity_log`'s migration is written, not run. Once manually run
   for testing, confirm at least one real logged event appears
   correctly (e.g. approve a topic, confirm a row appears) before
   claiming this works.
6. No changes to `components/DataTable.js` beyond what §6 explicitly
   allows, if anything.

## §10. Push back on this brief

If `DataTable.js`'s current state (re-read before building §6) already
has an empty-state override mechanism this doc doesn't know about, use
it and say so rather than adding a redundant one. If the settings
page's read-only scope feels genuinely too limited once built, say so
and propose the real config-table approach as a follow-up rather than
quietly expanding scope mid-task.
