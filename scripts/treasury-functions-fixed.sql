-- SQL functions for treasury balance monitoring and updating presale stats
-- This script creates all necessary tables and views from scratch

-- Drop existing views if they exist
DROP VIEW IF EXISTS public.presale_stats;

-- Create or update contributions table to include necessary columns
CREATE TABLE IF NOT EXISTS public.contributions (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  transaction_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add missing columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'contributions' 
                 AND column_name = 'created_at') THEN
    ALTER TABLE public.contributions ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'contributions' 
                 AND column_name = 'transaction_id') THEN
    ALTER TABLE public.contributions ADD COLUMN transaction_id TEXT;
  END IF;
END $$;

-- Create the presale_stats view 
CREATE OR REPLACE VIEW public.presale_stats AS
SELECT 
  1 as id,
  COALESCE(SUM(c.amount), 0) as total_raised,
  COUNT(DISTINCT c.wallet_address) as contributors,
  75 as cap,
  CURRENT_TIMESTAMP as last_updated
FROM public.contributions c;

-- Function to update presale stats from treasury balance
CREATE OR REPLACE FUNCTION public.update_presale_stats_from_treasury(
  p_treasury_balance NUMERIC
) RETURNS JSONB AS $$
DECLARE
  current_total NUMERIC;
  current_contributors INTEGER;
  result JSONB;
BEGIN
  -- Input validation
  IF p_treasury_balance IS NULL OR p_treasury_balance < 0 THEN
    RAISE EXCEPTION 'Treasury balance must be a non-negative number';
  END IF;

  -- Get current stats
  SELECT COALESCE(SUM(amount), 0), COUNT(DISTINCT wallet_address)
  INTO current_total, current_contributors
  FROM public.contributions;
  
  -- If treasury balance is greater than our recorded total, create a special contribution record
  IF p_treasury_balance > current_total THEN
    -- Calculate the difference
    DECLARE
      difference NUMERIC := p_treasury_balance - current_total;
    BEGIN
      -- Insert a special contribution record to account for the difference
      INSERT INTO public.contributions (
        wallet_address,
        amount,
        transaction_id
      )
      VALUES (
        '4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh', -- Treasury wallet itself
        difference,
        'manual-adjust-' || extract(epoch from now())::bigint
      );
    END;
  END IF;
  
  -- Get updated stats
  SELECT 
    jsonb_build_object(
      'total_raised', COALESCE(SUM(amount), 0),
      'contributors', COUNT(DISTINCT wallet_address),
      'cap', 75,
      'updated_at', CURRENT_TIMESTAMP
    )
  INTO result
  FROM public.contributions;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get contribution stats
CREATE OR REPLACE FUNCTION public.get_contribution_stats()
RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT 
    jsonb_build_object(
      'total_raised', COALESCE(SUM(amount), 0),
      'contributors', COUNT(DISTINCT wallet_address),
      'cap', 75,
      'last_updated', CURRENT_TIMESTAMP
    )
  INTO result
  FROM public.contributions;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable real-time functionality for the contributions table
BEGIN;
  -- Check if the publication exists first
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contributions;
  ELSE
    CREATE PUBLICATION supabase_realtime FOR TABLE public.contributions;
  END IF;
COMMIT;

-- Grant appropriate permissions
GRANT EXECUTE ON FUNCTION public.update_presale_stats_from_treasury TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_contribution_stats TO postgres, anon, authenticated, service_role;
GRANT SELECT ON public.presale_stats TO postgres, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON public.contributions TO postgres, anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE public.contributions_id_seq TO postgres, anon, authenticated, service_role; 