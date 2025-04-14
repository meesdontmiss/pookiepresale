-- Drop existing tables and views
DROP VIEW IF EXISTS public.presale_stats;
DROP TABLE IF EXISTS public.contributions CASCADE;

-- Create contributions table with minimal fields
CREATE TABLE public.contributions (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  transaction_id TEXT,  -- Add this field to satisfy the constraint
  transaction_signature TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_verified BOOLEAN DEFAULT false
);

-- Create the presale_stats view
CREATE OR REPLACE VIEW public.presale_stats AS
SELECT 
  1 as id,
  COALESCE(SUM(c.amount), 0) as total_raised,
  COUNT(DISTINCT c.wallet_address) as contributors,
  10.2613 as cap,
  CURRENT_TIMESTAMP as last_updated
FROM public.contributions c;

-- Grant appropriate permissions
ALTER TABLE public.contributions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations
CREATE POLICY "Allow all operations for everyone" ON public.contributions
  USING (true) WITH CHECK (true);

-- Grant access to the table and view
GRANT ALL ON public.contributions TO anon, authenticated, service_role;
GRANT SELECT ON public.presale_stats TO anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE public.contributions_id_seq TO anon, authenticated, service_role;

-- Insert a test record
INSERT INTO public.contributions (wallet_address, amount, transaction_id, transaction_signature, timestamp, is_verified)
VALUES 
  ('4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh', 10.2613, 'initial-import', 'initial-import-signature', NOW(), true); 