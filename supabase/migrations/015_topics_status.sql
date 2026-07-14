-- 015_topics_status.sql
-- Expands the topics.status check constraint to the new editorial workflow values,
-- migrates all existing rows to 'approved', and adds AI-sourcing columns.
--
-- DO NOT RE-RUN after applying. New rows created by /api/analyze-news use
-- status = 'pending_review'; human operators approve or reject from the UI.

-- 1. Drop the old inline check constraint (Postgres names it topics_status_check
--    when no explicit name is given at column definition time in 001_alpha_schema.sql).
alter table topics
  drop constraint if exists topics_status_check;

-- 2. Change the column default so new manually-added rows are 'approved' by default.
alter table topics
  alter column status set default 'approved';

-- 3. Migrate all existing rows — every manually-seeded topic is pre-approved.
update topics
  set status = 'approved'
  where status in ('new', 'reviewed', 'used');

-- 4. Add the new check constraint with the three editorial workflow values.
alter table topics
  add constraint topics_status_check
    check (status in ('approved', 'pending_review', 'rejected'));

-- 5. Add the AI-sourcing columns (nullable — hand-entered topics will have nulls).
alter table topics
  add column if not exists source_raw_news_item_id uuid
    references raw_news_items(id) on delete set null,
  add column if not exists ai_reasoning text;

-- Verifying SELECT — must show 'approved' row(s), no other statuses.
select status, count(*) as cnt
  from topics
  group by status
  order by status;
