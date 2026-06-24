-- User-configurable monthly expense items for dividend coverage calculation.
CREATE TABLE IF NOT EXISTS public.expense_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '💡',
    amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
    color TEXT NOT NULL DEFAULT 'bg-indigo-400',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.expense_items IS 'User-defined monthly living expense items used for dividend coverage calculation.';

CREATE INDEX IF NOT EXISTS expense_items_user_sort_idx
    ON public.expense_items (user_id, sort_order, created_at);

ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own expense items" ON public.expense_items;
CREATE POLICY "Users can view own expense items"
    ON public.expense_items FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own expense items" ON public.expense_items;
CREATE POLICY "Users can create own expense items"
    ON public.expense_items FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own expense items" ON public.expense_items;
CREATE POLICY "Users can update own expense items"
    ON public.expense_items FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own expense items" ON public.expense_items;
CREATE POLICY "Users can delete own expense items"
    ON public.expense_items FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
