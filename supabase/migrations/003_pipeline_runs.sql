-- Already applied to the live database. Do not re-run.
create table if not exists pipeline_runs (
  id             bigserial primary key,
  created_at     timestamptz not null default now(),
  input_text     text,
  target_platform text,
  topic_id       bigint references topics(id) on delete set null,
  script         text,
  hook_options   jsonb,
  title_options  text[],
  selected_hook  text,
  selected_title text,
  thumbnail_url  text,
  thumbnail_prompt text,
  status         text not null default 'draft'
);

alter table pipeline_runs enable row level security;
create policy "open" on pipeline_runs for all using (true) with check (true);
