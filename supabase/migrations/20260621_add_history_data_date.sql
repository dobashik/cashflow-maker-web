-- Date represented by the CSV. Falls back to the import time when no date is in the filename.
ALTER TABLE public.portfolio_history
    ADD COLUMN IF NOT EXISTS data_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
