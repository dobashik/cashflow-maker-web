-- Add analysis columns to holdings table
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS ir_rank text;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS ir_score integer;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS ir_detail text;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS ir_flag text;
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS ir_date text;

-- Add comments for clarity (Optional but recommended)
COMMENT ON COLUMN holdings.ir_rank IS 'Evaluation Rank (S, A, B, etc.)';
COMMENT ON COLUMN holdings.ir_score IS 'Comprehensive Score';
COMMENT ON COLUMN holdings.ir_detail IS 'Detail of the rank/evaluation';
COMMENT ON COLUMN holdings.ir_flag IS 'Warning or Caution Flag';
COMMENT ON COLUMN holdings.ir_date IS 'Date of analysis';
