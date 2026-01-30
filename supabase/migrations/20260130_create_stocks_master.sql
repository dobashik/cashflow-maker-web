-- Create stocks master table
CREATE TABLE stocks (
    code TEXT PRIMARY KEY,
    price NUMERIC,
    sector TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users
CREATE POLICY "Allow read access to all authenticated users" ON stocks
    FOR SELECT TO authenticated USING (true);

-- Allow insert/update access to all authenticated users (since anyone can import/update stock data)
CREATE POLICY "Allow insert/update access to all authenticated users" ON stocks
    FOR ALL TO authenticated USING (true);

-- Initial data migration: Insert unique stocks from holdings
INSERT INTO stocks (code, price, sector, updated_at)
SELECT DISTINCT ON (code) 
    code, 
    price, 
    sector, 
    updated_at 
FROM holdings
ORDER BY code, updated_at DESC;

-- Note: We are NOT adding a foreign key constraint immediately to avoid breaking existing data if there are inconsistencies.
-- The application logic will handle the relationship by joining on 'code'.
-- However, for data integrity, it is recommended to add it eventually. For now, we proceed without strict FK enforcement to 'holdings' to ensure smooth migration, 
-- or we can add it if we are sure keys match. 
-- Since we just populated from holdings, it should be safe, but let's stick to the plan of "creating the table and logic" first.
-- Actually, the user asked for "Master table creation", so FK is good practice.

-- Add Foreign Key Constraint (Optional but recommended, commenting out to prevent issues if run on live data with active writes)
-- ALTER TABLE holdings ADD CONSTRAINT fk_holdings_stocks FOREIGN KEY (code) REFERENCES stocks (code);
