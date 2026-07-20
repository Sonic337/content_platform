-- 016_fix_pipeline_runs_topic_id_type.sql
-- Fixes a long-standing type mismatch: pipeline_runs.topic_id was bigint,
-- but topics.id is uuid, meaning a valid FK relationship was never
-- actually possible. Confirmed via live query before applying: all 31
-- existing pipeline_runs rows had topic_id = null, so no data was lost.
--
-- Already applied directly in the Supabase SQL editor. This file is the
-- historical record only, per this project's migration convention
-- (reference after being applied; never re-run).

alter table pipeline_runs
  drop column if exists topic_id;

alter table pipeline_runs
  add column topic_id uuid references topics(id) on delete set null;
