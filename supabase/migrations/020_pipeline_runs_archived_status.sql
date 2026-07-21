-- 020_pipeline_runs_archived_status.sql
-- Extends the pipeline_runs.status check constraint to allow 'archived'.
-- Follows the exact same pattern as 019_topics_archived_status.sql.
--
-- pipeline_runs already had a constraint named pipeline_runs_status_check
-- covering (draft, approved, published) — confirmed live via PATCH probe.
-- After this migration the four valid values are:
--   draft | approved | published | archived
--
-- Archived runs are never deleted — status flip only, fully reversible.
-- Un-archiving sets status back to 'draft' (the original default).
--
-- DO NOT RE-RUN after applying to the live database.

ALTER TABLE pipeline_runs
  DROP CONSTRAINT IF EXISTS pipeline_runs_status_check;

ALTER TABLE pipeline_runs
  ADD CONSTRAINT pipeline_runs_status_check
    CHECK (status IN ('draft', 'approved', 'published', 'archived'));

-- Verify.
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'pipeline_runs_status_check';
