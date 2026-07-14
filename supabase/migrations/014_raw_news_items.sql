-- Migration 014: raw_news_items staging table for Hermes/Sparkron Telegram webhook
-- Status: ingestion staging only. AI analysis and topics promotion are step 2.
-- DO NOT RE-RUN — reference only once applied to the live database.

create table if not exists raw_news_items (
  id                   uuid          primary key default gen_random_uuid(),
  telegram_message_id  bigint        not null,
  telegram_chat_id     bigint        not null,
  message_text         text          not null,
  posted_at            timestamptz   not null,        -- from Telegram message.date (unix seconds)
  received_at          timestamptz   not null default now(),  -- when our webhook received it
  raw_payload          jsonb         not null,        -- full Telegram Update object for debugging
  status               text          not null default 'unprocessed',  -- 'unprocessed' | 'processed' | 'ignored'
  created_at           timestamptz   not null default now(),

  constraint raw_news_items_chat_message_unique
    unique (telegram_chat_id, telegram_message_id)
);

-- Open RLS policy (single-team alpha, matching all other tables in this project)
alter table raw_news_items enable row level security;
create policy "open" on raw_news_items for all using (true);

-- Verify the table landed correctly
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_name = 'raw_news_items'
order by ordinal_position;
