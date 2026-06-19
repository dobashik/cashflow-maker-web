-- Keep the original CSV names with each import history entry.
ALTER TABLE public.portfolio_history
    ADD COLUMN IF NOT EXISTS file_names TEXT[] NOT NULL DEFAULT '{}';
