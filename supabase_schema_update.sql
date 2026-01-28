-- Add dividend_months column if it doesn't exist (integer array)
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS dividend_months INTEGER[];

-- Add fiscal_year_month column if it doesn't exist (integer)
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS fiscal_year_month INTEGER;

-- Comment on columns for clarity
COMMENT ON COLUMN holdings.dividend_months IS 'List of months (1-12) when dividends/benefits are received';
COMMENT ON COLUMN holdings.fiscal_year_month IS 'The fiscal year end month (1-12) of the company';
