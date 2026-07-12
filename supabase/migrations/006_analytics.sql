-- REFERENCE ONLY — already applied to the live database, do not re-run

create table if not exists analytics (
  id                  bigserial primary key,
  platform            text,
  post_url            text,
  posted_at           date,
  pipeline_run_id     bigint references pipeline_runs(id) on delete set null,
  views               bigint,
  likes               bigint,
  comments            bigint,
  shares              bigint,
  saves               bigint,
  avg_watch_time_sec  numeric,
  retention_pct       numeric,
  notes               text,
  created_at          timestamptz default now()
);
