-- Portfolio snapshots created after each SBI/Rakuten CSV import.
CREATE TABLE IF NOT EXISTS public.portfolio_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('SBI', 'Rakuten')),
    import_mode TEXT NOT NULL CHECK (import_mode IN ('replace', 'append')),
    holdings_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
    total_value NUMERIC NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.portfolio_history IS 'CSV import snapshots for comparing past and current portfolios';
COMMENT ON COLUMN public.portfolio_history.holdings_data IS 'Complete portfolio snapshot at import time';

CREATE INDEX IF NOT EXISTS portfolio_history_user_created_idx
    ON public.portfolio_history (user_id, created_at DESC);

ALTER TABLE public.portfolio_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own portfolio history" ON public.portfolio_history;
CREATE POLICY "Users can view own portfolio history"
    ON public.portfolio_history FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own portfolio history" ON public.portfolio_history;
CREATE POLICY "Users can create own portfolio history"
    ON public.portfolio_history FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own portfolio history" ON public.portfolio_history;
CREATE POLICY "Users can delete own portfolio history"
    ON public.portfolio_history FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
