# Design Doc — Day 2a: Make Reviewing Painless (review-speed only)

_Status: draft, awaiting human review before any Codex run. Not applied._
_References real code: app/topics/page.js (full contents read directly),
lib/tierColor.js, components/DataTable.js._

---

## §1. Scope split from the original Day 2

Original Day 2 (roadmap) bundled 7 items. Split here because they're not
equally ready:

**In this doc (Day 2a):** two-pass triage, keyboard-first review, saved
rejection reasons. All three are pure additions to `app/topics/page.js`,
no new dependencies, no open architectural questions.

**Deferred, not in this doc:**
- Pairwise priority review — needs a genuinely different UI shape (a
  two-up comparison, not a list). `/topics` is currently a flat list;
  this isn't a small addition, it's a new view. Needs its own design
  pass.
- Approval snapshot + expiry deadline — needs new schema
  (`topics.rejection_reason`, `topics.approved_snapshot`,
  `topics.expires_at` or similar). Bundled separately so a schema
  migration doesn't ship in the same PR as pure UI changes.
- Claim-diffing on regeneration — **blocked, not just deferred.** This
  assumes a "regenerate an existing script" feature. Every current
  generation (per CONTEXT.md's Pipeline section) creates a brand-new
  `pipeline_runs` row — there is no confirmed "regenerate this specific
  run" action to diff against. `app/pipeline/page.js` has not been read
  in this design process; confirm whether regeneration exists at all
  before this item can be scoped, let alone built.

## §2. Confirmed real state of `app/topics/page.js`

- `sortRows` already puts `pending_review` first, then by `date_added`
  descending. No change needed here.
- `handleApprove`/`handleReject`/`handleRevert` are bare
  `supabase.from("topics").update({status}).eq("id", id)` calls — no
  reason captured, no snapshot, no confirmation.
- Every row currently renders fully at all times: title, meta columns,
  full `ai_reasoning` text, action buttons — via `DataTable`'s default
  row rendering plus `renderRowFooter`. There is no collapsed/expanded
  state anywhere in this file or in `DataTable.js`.
- The "Raw messages" section (lines rendering `rawItems`) is already a
  **custom, non-DataTable component** sitting above the `DataTable`
  instance — a proven precedent for building a separate, page-specific
  UI section without touching the shared component.
- The `[BORDERLINE]` flag is detected via
  `row.ai_reasoning?.includes("[BORDERLINE]")` — string matching on free
  text. Fragile; worth fixing while this file is already being touched
  for other reasons (§5).

## §3. Design decision: two-pass triage reuses the "Raw messages" pattern, does not touch `DataTable.js`

Rather than adding collapse/expand state to `DataTable` (which is shared
by five pages and was explicitly protected from changes in the Day 1
doc), build a new **"Review queue"** section on `/topics`, structured
exactly like the existing "Raw messages" section: a custom component
rendering only `pending_review` topics, sitting above the `DataTable`.

The `DataTable` below continues to show the full topic history
(approved/rejected/pending) exactly as today, unchanged — it becomes the
"full record," while the new Review queue section becomes the actual
place review happens.

### Review queue — pass one (compact)

For each `pending_review` topic, show only: `title`, first ~100 chars of
`ai_reasoning`'s "Relevance:" line (already a real, parseable prefix per
the analyze-news route's known output shape), `source_name` if present,
and the borderline tag if applicable. One row per topic, no full
reasoning text, no full summary.

### Review queue — pass two (full detail)

Clicking/expanding a compact row (or navigating to it via keyboard, §4)
reveals the full `ai_reasoning` text and existing Approve/Reject/Revert
buttons — i.e., what `renderRowFooter` already renders today, reused
as-is inside the expanded state.

## §4. Keyboard-first review mode

Scope: an `onKeyDown` listener attached to the Review queue section
(not global to the whole page, to avoid interfering with the existing
`DataTable` filter dropdowns/inputs below it).

Track a `currentIndex` into the `pending_review` list (already sorted
oldest-appropriate via the existing `sortRows` logic — reuse the same
ordering, don't invent a new one).

Proposed keys (adjust freely, but pick something and be explicit in the
PR rather than leaving it undefined):
- `A` — approve current item, advance to next
- `R` — open the reason picker (§5) for the current item
- `S` — skip/snooze (moves to end of the current session's queue,
  doesn't change DB status)
- `→` / `↓` — next item
- `←` / `↑` — previous item

**Undo:** reuse the existing `handleRevert` function as-is — it already
flips a topic back to `pending_review`. Show a brief "Approved — undo?"
affordance after an approve action, calling `handleRevert` if clicked.
Don't build a new undo mechanism; the one that exists already does the
job.

## §5. Saved rejection reasons

### New migration (write only, do not run — human reviews first)

```sql
alter table topics
  add column if not exists rejection_reason text;

alter table topics
  add constraint topics_rejection_reason_check
    check (
      rejection_reason is null or rejection_reason in (
        'too_late', 'too_generic', 'weak_evidence', 'wrong_audience',
        'no_demonstration', 'duplicate_angle', 'too_costly'
      )
    );
```

Also, opportunistically, since this file and this table are already
being touched (§2's fragility note):

```sql
alter table topics
  add column if not exists is_borderline boolean not null default false;
```

Backfill in the same migration:

```sql
update topics
  set is_borderline = true
  where ai_reasoning like '%[BORDERLINE]%';
```

Update `app/topics/page.js` to read `row.is_borderline` directly instead
of string-matching `ai_reasoning`. This also means
`app/api/analyze-news/route.js`'s insert (Step 4, per earlier
verified session work) should set `is_borderline` as a real boolean
field going forward — read that route's current insert logic directly
before editing it, since this design doc is working from earlier-session
knowledge of that file, not a fresh read.

### UI

`handleReject` changes from an immediate status flip to opening a small
inline picker — plain-language labels, not the raw constraint values:

- "Too late" (`too_late`)
- "Too generic" (`too_generic`)
- "Evidence too weak" (`weak_evidence`)
- "Wrong audience" (`wrong_audience`)
- "No real demonstration" (`no_demonstration`)
- "Duplicate of something else" (`duplicate_angle`)
- "Too costly to produce" (`too_costly`)

Selecting one calls
`supabase.from("topics").update({ status: "rejected", rejection_reason: value }).eq("id", id)`.
The keyboard `R` key (§4) should open this picker, then accept a
single further keypress or click to finalize — don't require a mouse for
the common case.

## §6. Explicit non-goals for Day 2a

- No changes to `components/DataTable.js`.
- No pairwise review UI.
- No approval snapshot, no expiry/deadline field.
- No claim-diffing — blocked pending Pipeline regeneration confirmation.
- No changes to `app/api/analyze-news/route.js`'s Step 1–3 logic (only
  Step 4's insert shape, for `is_borderline`, per §5).

## §7. Acceptance criteria

1. A new "Review queue" section exists on `/topics`, structurally
   parallel to the existing "Raw messages" section, showing only
   `pending_review` topics.
2. Pass-one view shows compact info only; expanding reveals full detail
   via the existing `renderRowFooter`-equivalent content.
3. Keyboard shortcuts from §4 work without requiring mouse focus on any
   particular element first (attached at the section level).
4. `handleRevert`'s existing behavior is reused for undo — no new undo
   mechanism built.
5. Rejecting requires selecting one of the 7 reasons in §5; the reason
   is actually persisted in `topics.rejection_reason` — confirm via a
   real query, not just UI behavior.
6. `is_borderline` is a real boolean column, backfilled correctly for
   existing rows (verify count of `true` rows matches the count of rows
   that previously matched the `[BORDERLINE]` string, via a live query
   before and after).
7. `components/DataTable.js` is untouched.
8. The migration file is written and NOT run — left for human review,
   per this project's standing rule (CONTEXT.md §9).

## §8. Push back on this brief

If `app/api/analyze-news/route.js`'s real current Step 4 insert logic
(read it fresh, don't rely on this doc's secondhand description) already
handles borderline differently than assumed, say so and adjust rather
than forcing the described shape. If keyboard event handling at the
section level conflicts with the existing `DataTable` filter
inputs/selects in a way that's awkward to avoid, say so rather than
degrading the existing filter UX to make room for this.
