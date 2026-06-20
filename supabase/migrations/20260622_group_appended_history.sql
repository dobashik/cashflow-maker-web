-- Allow subsequent CSV files in the same update session to extend one history row.
ALTER TABLE public.portfolio_history
    ADD COLUMN IF NOT EXISTS sources TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT false;

UPDATE public.portfolio_history
SET sources = ARRAY[source]
WHERE cardinality(sources) = 0;

CREATE UNIQUE INDEX IF NOT EXISTS portfolio_history_one_open_per_user_idx
    ON public.portfolio_history (user_id)
    WHERE is_open;

DROP POLICY IF EXISTS "Users can update own portfolio history" ON public.portfolio_history;
CREATE POLICY "Users can update own portfolio history"
    ON public.portfolio_history FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
