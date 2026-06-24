-- Actual dividend payment history imported from SBI deposit/withdrawal CSV files.
CREATE TABLE IF NOT EXISTS public.dividend_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    broker TEXT NOT NULL CHECK (broker IN ('SBI')),
    file_name TEXT,
    imported_count INTEGER NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
    skipped_duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_duplicate_count >= 0),
    payment_start_date DATE,
    payment_end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.dividend_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES public.dividend_import_batches(id) ON DELETE CASCADE,
    broker TEXT NOT NULL CHECK (broker IN ('SBI')),
    payment_date DATE NOT NULL,
    stock_name TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0),
    tax_category TEXT NOT NULL DEFAULT 'Unknown' CHECK (tax_category IN ('NISA', 'Taxable', 'Unknown')),
    source_fingerprint TEXT NOT NULL,
    is_processed BOOLEAN NOT NULL DEFAULT false,
    processed_at TIMESTAMPTZ,
    processed_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.dividend_import_batches IS 'Dividend CSV import attempts. Raw CSV content is not stored.';
COMMENT ON TABLE public.dividend_payments IS 'Actual dividend payment rows extracted from deposit/withdrawal CSV files.';
COMMENT ON COLUMN public.dividend_payments.source_fingerprint IS 'Deduplication key generated from broker, date, stock name, amount, tax category, and original description.';
COMMENT ON COLUMN public.dividend_payments.is_processed IS 'User-managed flag for whether this dividend payment has been handled.';

CREATE UNIQUE INDEX IF NOT EXISTS dividend_payments_user_fingerprint_idx
    ON public.dividend_payments (user_id, source_fingerprint);

CREATE INDEX IF NOT EXISTS dividend_import_batches_user_created_idx
    ON public.dividend_import_batches (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS dividend_payments_user_date_idx
    ON public.dividend_payments (user_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS dividend_payments_user_processed_idx
    ON public.dividend_payments (user_id, is_processed, payment_date DESC);

ALTER TABLE public.dividend_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividend_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own dividend import batches" ON public.dividend_import_batches;
CREATE POLICY "Users can view own dividend import batches"
    ON public.dividend_import_batches FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own dividend import batches" ON public.dividend_import_batches;
CREATE POLICY "Users can create own dividend import batches"
    ON public.dividend_import_batches FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own dividend import batches" ON public.dividend_import_batches;
CREATE POLICY "Users can delete own dividend import batches"
    ON public.dividend_import_batches FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own dividend payments" ON public.dividend_payments;
CREATE POLICY "Users can view own dividend payments"
    ON public.dividend_payments FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own dividend payments" ON public.dividend_payments;
CREATE POLICY "Users can create own dividend payments"
    ON public.dividend_payments FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own dividend payments" ON public.dividend_payments;
CREATE POLICY "Users can update own dividend payments"
    ON public.dividend_payments FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own dividend payments" ON public.dividend_payments;
CREATE POLICY "Users can delete own dividend payments"
    ON public.dividend_payments FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
