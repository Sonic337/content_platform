# Changelog

All notable changes to this project, organized by feature rather than by
individual commit.

## [Unreleased] — Session 4: Telegram news ingestion + AI review pipeline

### Added
- **Telegram webhook ingestion** (`/api/hermes-webhook`): receives
  messages pushed from a connected Telegram bot in real time, stores them
  in a new `raw_news_items` table. Duplicate-safe (unique constraint on
  chat ID + message ID).
- **Manual group fetch** (`/api/fetch-group-news`, button on `/topics`):
  on-demand pull of recent messages from a specific Telegram group the
  user is a member of, using the user's own Telegram account
  (not a bot) via a one-time local login. Deliberately not automated or
  scheduled — triggered only by an explicit click. 48-hour lookback
  window, same duplicate-safe insert as the webhook path.
- **AI news analysis pipeline** (`/api/analyze-news`, "Run news" button):
  reads raw ingested messages and:
  - Detects and splits multi-story digest messages into individual topic
    candidates, rather than treating a 10-story digest as one topic.
  - Scores every candidate 1–10 against an explicit written rubric
    (`skills/content-review.md`) covering specificity, niche fit,
    freshness, and content-actionability.
  - Checks for duplicates against existing topics before creating new
    ones.
  - Runs a live web search to gauge how fresh/saturated a story actually
    is.
  - Writes results as `pending_review` topics — never auto-approved.
- **Topic review workflow** on `/topics`: Approve / Reject buttons on
  AI-suggested topics, a "revert to pending review" action for
  mis-clicks, status filter pills, and pending-review items always
  sorted to the top of the list.
- **`topics.status` workflow** expanded to `approved` / `pending_review`
  / `rejected`, with `source_raw_news_item_id` and `ai_reasoning` columns
  added to trace every AI-created topic back to its source and reasoning.
- Pipeline's topic picker now only shows `approved` topics — unreviewed
  or rejected AI suggestions can never be used for generation.

### Fixed
- Digest-style Telegram messages (multiple numbered findings in one
  message) were initially being rejected wholesale by the relevance
  check, because the model judged the message's overall framing before
  ever inspecting individual findings. Rewrote the review logic to check
  message structure first, then evaluate each finding independently.
- Long-form AI reasoning text (from the freshness/saturation check) was
  occasionally being cut off mid-sentence in storage — fixed by
  collecting the model's full response instead of only its first
  response segment.
- Fixed a GramJS/Telegram library import incompatible with strict ESM.
- Fixed Telegram group-ID resolution for basic (non-super) groups, which
  were being misidentified as user IDs rather than chat IDs.

### Infrastructure
- New Supabase migrations: `014_raw_news_items.sql`,
  `015_topics_status.sql`.
- New environment variables: `TELEGRAM_BOT_TOKEN`,
  `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`,
  `TELEGRAM_USER_SESSION`, `TELEGRAM_GROUP_IDENTIFIER`.

---

## Session 3

### Added
- Per-platform hook transformer: rewrites a hook's tone/format for a
  target platform without altering its underlying factual claims.
  Results cached, with a manual re-run option.
- Risk-tiered multi-variant hook generation: every generation now
  returns three labeled sets (conservative / mixed / experimental) based
  on evidence tier, with a server-computed note explaining any fallback.
- Hook-to-thumbnail pattern pairing, grounded in seeded visual-pattern
  research.
- Hook-performance audit page: joins approved/published runs to their
  evidence tier and real logged analytics.
- Import-review queue: trigram-similarity duplicate/contradiction
  detection on bulk hook imports.

### Fixed
- Hook evidence tier is now saved directly at approval time instead of
  being re-derived later by text-matching, which failed once hooks were
  AI-paraphrased before display.
- `pipeline_run_id` was incorrectly coerced to a number in Analytics; it
  is a UUID.

---

## Session 2

### Added
- Five core pages (Overview, Topics, Hooks, Corpus, Pipeline) plus
  Analytics, all wired to Supabase.
- Initial hook bank (117 hooks) seeded with evidence tiers.
- Initial topics feed (20 dated items) seeded from research.

### Fixed
- Infinite-loading bug on `/topics` and `/analytics` caused by an
  unstable default array reference in a data-fetching dependency array.
- Stale Overview page copy referencing an earlier, smaller build.

---

## Known open items (not yet started)

- `/corpus` has no real content yet — voice-matching in generation is
  blocked on this.
- No integration yet with a live-search model (e.g. Grok/xAI) for
  X-specific virality/saturation signal — current saturation check uses
  general web search only.
- No automated tests, CI, or PR review process (see README).
