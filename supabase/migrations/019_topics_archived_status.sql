-- 019_topics_archived_status.sql
-- Extends the topics.status check constraint to allow 'archived'.
-- Archived rows are never deleted — status flip only, fully reversible.
-- The four valid values after this migration:
--   approved | pending_review | rejected | archived
--
-- DO NOT RE-RUN after applying to the live database.

-- Drop the existing constraint added by migration 015.
ALTER TABLE topics
  DROP CONSTRAINT IF EXISTS topics_status_check;

-- Re-add with 'archived' included.
ALTER TABLE topics
  ADD CONSTRAINT topics_status_check
    CHECK (status IN ('approved', 'pending_review', 'rejected', 'archived'));

-- Verify.
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'topics_status_check';
