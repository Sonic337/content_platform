# Design Doc — Day 3b: Topic-linked Pipeline features

_Status: draft, awaiting human review before any Codex run. Not applied._
_Depends on: migration 016 (pipeline_runs.topic_id type fix) and the
Number() coercion fix in app/pipeline/page.js — both confirmed working
end-to-end via a real generate call producing a populated topic_id
(Session 5, CONTEXT.md)._
_References real code: app/pipeline/page.js, app/topics/page.js,
app/api/generate/route.js (all read directly in full)._

---

## §1. Why this was blocked, and why it's safe to build now

Original Day 3 items 14 (kanban board), 15 (next-best-idea), and 17
(script history grouped by topic) all require querying pipeline_runs by
topic_id and trusting the result. Until Session 5's fix, that column
was structurally incapable of holding a valid reference (type
mismatch) and, separately, the UI never actually sent a real value even
when a topic was picked (Number() coercion bug). Both are now fixed and
confirmed via a real query showing populated, correct topic_id values
across multiple generations. Safe to build against directly.

## §2. Confirmed real state relevant to this doc

- `topics.status` values: `approved` / `pending_review` / `rejected`
  (topicStatusColors, lib/tierColor.js).
- `pipeline_runs.status` values: `draft` / `approved` / `published`
  (confirmed directly from app/pipeline/page.js's conditional buttons).
- `app/pipeline/page.js`'s "Pick topic" mode already only lists
  `status = 'approved'` topics (`loadTopics`'s existing `.eq("status",
  "approved")` filter) — the kanban/next-best-idea logic below can rely
  on this same filter already being correct, no change needed there.
- There is still no regeneration feature — every Generate call creates
  a new `pipeline_runs` row. "Script history for a topic" therefore
  means "all rows sharing a topic_id," not "versions of one script."
  This is a real, correct distinction — state it plainly in any UI
  copy, so it doesn't read as if editing history/versioning exists when
  it doesn't (that's Day 3a's item 16, a separate concern: in-place
  editing of one row's content, not multiple versions).

## §3. Item 17 — script history by topic (build this first; items 14/15 build on it)

### New query

A function, `fetchRunsForTopic(topicId)`, returning all `pipeline_runs`
rows where `topic_id = topicId`, sorted by `created_at` descending.

### UI placement

On `/topics`, extend the existing `renderRowFooter` (already used for
Approve/Reject/Revert and `ai_reasoning` display) to also show, for any
topic, a count and list of linked runs if any exist: "3 scripts
generated from this topic" with each one expandable to show its status
and a link/jump to that run's card on `/pipeline`.

On `/pipeline`, no major change needed — `RunCard` could optionally show
its linked topic's title (a small line, e.g. "from: <topic title>") if
`run.topic_id` is set, using one lookup per run or a single batch fetch
of topic titles for all visible runs (avoid N+1 queries — fetch topics
once for all currently-loaded runs, not one query per card).

## §4. Item 15 — "next best idea" auto-suggestion

Now buildable correctly: an approved topic with **zero** linked
`pipeline_runs` rows, with the highest analyze-news score (from
`ai_reasoning`'s stored `Score: N/10` prefix — this is stored as text,
not a separate column; parsing it out via a simple regex/string split
is acceptable here since it already exists in this exact shape from the
analyze-news route, confirmed earlier today).

### Query shape

1. Fetch all `approved` topics.
2. Fetch all distinct `topic_id` values currently present in
   `pipeline_runs` (now meaningful, post-fix).
3. Filter step 1's list to exclude anything in step 2's set.
4. From what remains, sort by parsed score descending, take the top one.

### UI

A single, prominent element — likely on a future Day 1 "Today" dashboard
card, but for this pass, place it directly on `/pipeline` above the
generate form: "Next best idea: <title> (score N/10)" with a button that
pre-fills the "Pick topic" mode with that exact topic selected, one
click from suggestion to generation.

**If no approved topic has zero linked runs** (i.e. everything approved
has already been generated at least once), show nothing rather than a
confusing empty suggestion — don't force a recommendation when there
genuinely isn't a good one.

## §5. Item 14 — visual content board (kanban)

The most complex item in this doc — a genuinely new page/view, not an
addition to an existing one.

### Lane definition, mapped to real, confirmed statuses (do not invent new ones)

- **Idea** — `topics` where `status = 'approved'` AND no linked
  `pipeline_runs` row exists (same set §4 computes for "next best idea";
  reuse that query, don't duplicate the logic).
- **Scripted** — `pipeline_runs` where `status = 'draft'`.
- **Reviewed** — `pipeline_runs` where `status = 'approved'`.
- **Posted** — `pipeline_runs` where `status = 'published'`.

**Explicitly, there is no "Ready to Film" lane** — the roadmap's
original wording listed one, but there is no corresponding status
anywhere in the real schema, and inventing a new status value for this
alone is out of scope for this pass. Four lanes, matching real data,
not five including one that doesn't exist yet.

### New page: `app/board/page.js` (or similar — confirm this doesn't collide with an existing route before creating it)

A simple four-column layout, each column populated by its query above.
Each card shows: title (topic title for Idea-lane cards, run's
`selected_title` or first title option for the other three lanes),
platform (for non-Idea lanes), and a link to the relevant full page
(`/topics` or `/pipeline`) to actually act on it.

**Explicitly not required for this pass:** drag-and-drop to change
status directly from the board. That's a real, separate interaction
to design (what does dragging a card from "Scripted" to "Reviewed"
actually call — the same `updateRun` logic already in `RunCard`?) and
risks becoming its own multi-day effort. Ship a read-only board first;
each card's status still changes via the existing pages' existing
buttons. Add drag-and-drop later if the read-only version proves useful
enough to invest further.

## §6. Explicit non-goals for Day 3b

- No drag-and-drop on the kanban board (§5).
- No new `pipeline_runs` or `topics` status values invented.
- No changes to `components/DataTable.js`.
- No changes to `app/api/analyze-news/route.js`.
- No versioning/regeneration UI — "history" means multiple independent
  runs sharing a topic, not versions of one script (§2).

## §7. Acceptance criteria

1. `fetchRunsForTopic` returns correct results — verify against the
   real rows already confirmed in Session 5 (topic `efcab7c1...` should
   show 2 linked runs).
2. `/topics` shows linked-run counts/links on topics that have them; no
   change in appearance for topics that don't.
3. "Next best idea" correctly excludes any approved topic with an
   existing linked run — verify against real data, not just logic
   inspection.
4. The kanban board's four lanes show real, correctly-bucketed data —
   spot-check at least one real item per lane against a direct query.
5. No fifth "Ready to Film" lane exists anywhere in the shipped code.
6. No changes to `components/DataTable.js` or
   `app/api/analyze-news/route.js`.

## §8. Push back on this brief

If parsing the score out of `ai_reasoning`'s text (§4) proves fragile
in practice (formats vary more than expected), stop and propose adding
a real `score` column to `topics` instead of forcing a text-parsing
approach to work — this would be a small, worthwhile migration, not a
hack to route around. If the route path `app/board/page.js` collides
with something existing, pick a different one and say so.
