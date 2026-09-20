-- 海外（米国ETFなど）の保有銘柄と分配金に対応する。
-- 日本株の holdings とは通貨・税制・取り込み経路が異なるため、別テーブルで管理する。

CREATE TABLE IF NOT EXISTS public.overseas_holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    broker TEXT NOT NULL DEFAULT 'SBI',
    market TEXT NOT NULL DEFAULT 'US',
    ticker TEXT NOT NULL,
    name TEXT NOT NULL,
    exchange TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'USD',
    account_type TEXT NOT NULL DEFAULT '特定' CHECK (account_type IN ('特定', 'NISA', '一般')),
    quantity NUMERIC(16, 4) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    price_foreign NUMERIC(16, 4) NOT NULL DEFAULT 0,
    price_jpy NUMERIC(16, 2) NOT NULL DEFAULT 0,
    acquisition_price_foreign NUMERIC(16, 4) NOT NULL DEFAULT 0,
    acquisition_price_jpy NUMERIC(16, 2) NOT NULL DEFAULT 0,
    valuation_foreign NUMERIC(16, 4) NOT NULL DEFAULT 0,
    valuation_jpy NUMERIC(16, 2) NOT NULL DEFAULT 0,
    gain_loss_foreign NUMERIC(16, 4) NOT NULL DEFAULT 0,
    gain_loss_jpy NUMERIC(16, 2) NOT NULL DEFAULT 0,
    fx_rate NUMERIC(12, 4) NOT NULL DEFAULT 0,
    annual_dividend_per_share_foreign NUMERIC(12, 4) NOT NULL DEFAULT 0,
    dividend_months INTEGER[] NOT NULL DEFAULT '{}',
    data_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

COMMENT ON TABLE public.overseas_holdings IS 'Overseas (US ETF etc.) holdings pasted from the broker screen.';
COMMENT ON COLUMN public.overseas_holdings.fx_rate IS 'Effective JPY per foreign unit, derived from the broker yen-converted values.';
COMMENT ON COLUMN public.overseas_holdings.annual_dividend_per_share_foreign IS 'User-entered annual dividend per share in foreign currency (before tax).';

CREATE UNIQUE INDEX IF NOT EXISTS overseas_holdings_user_ticker_account_idx
    ON public.overseas_holdings (user_id, ticker, account_type);

ALTER TABLE public.overseas_holdings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own overseas holdings" ON public.overseas_holdings;
CREATE POLICY "Users can view own overseas holdings"
    ON public.overseas_holdings FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own overseas holdings" ON public.overseas_holdings;
CREATE POLICY "Users can create own overseas holdings"
    ON public.overseas_holdings FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own overseas holdings" ON public.overseas_holdings;
CREATE POLICY "Users can update own overseas holdings"
    ON public.overseas_holdings FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own overseas holdings" ON public.overseas_holdings;
CREATE POLICY "Users can delete own overseas holdings"
    ON public.overseas_holdings FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- 配当金履歴を海外分にも対応させる。
-- 海外の受取額は小数を含む（例: 4,532.97円）ため、整数から数値型に変更する。
ALTER TABLE public.dividend_payments
    ALTER COLUMN amount TYPE NUMERIC(14, 2);

ALTER TABLE public.dividend_payments
    ADD COLUMN IF NOT EXISTS market TEXT NOT NULL DEFAULT 'JP',
    ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'JPY',
    ADD COLUMN IF NOT EXISTS amount_foreign NUMERIC(14, 4),
    ADD COLUMN IF NOT EXISTS ticker TEXT,
    ADD COLUMN IF NOT EXISTS quantity NUMERIC(16, 4),
    ADD COLUMN IF NOT EXISTS account_label TEXT;

COMMENT ON COLUMN public.dividend_payments.amount IS 'Received amount in JPY after tax. Overseas rows use the broker yen-converted value.';
COMMENT ON COLUMN public.dividend_payments.market IS 'JP = domestic stock (deposit detail CSV), US = overseas (dividend detail CSV).';

CREATE INDEX IF NOT EXISTS dividend_payments_user_market_date_idx
    ON public.dividend_payments (user_id, market, payment_date DESC);

ALTER TABLE public.dividend_import_batches
    ADD COLUMN IF NOT EXISTS market TEXT NOT NULL DEFAULT 'JP';
