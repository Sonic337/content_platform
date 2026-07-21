-- 018_topics_approved_at.sql
-- Add approved_at timestamp to record WHEN a topic was approved.
--
-- No backfill is applied to existing approved rows. There is no way to
-- reconstruct the historical moment of approval for rows that already exist.
-- A null approved_at on an approved topic means it was approved before this
-- migration shipped — that is correct and expected, NOT a bug.
-- approved_at will be populated going forward by the UI handler in
-- app/topics/page.js whenever status is changed to 'approved'.
--
-- DO NOT RE-RUN after applying to the live database.

ALTER TABLE topics
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Verify the column landed.
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'topics' AND column_name = 'approved_at';
