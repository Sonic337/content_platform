-- Add original_date column to topics table.
-- Stores the date the event/story was originally published or occurred,
-- separate from date_added (row insertion time).
ALTER TABLE topics ADD COLUMN IF NOT EXISTS original_date date;
