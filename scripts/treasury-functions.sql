-- SQL functions for treasury balance monitoring and updating presale stats
-- Run this in your Supabase SQL Editor to create the necessary functions

-- Function to create the presale_stats view if it doesn't exist
CREATE OR REPLACE FUNCTION create_presale_stats_view() RETURNS VOID AS $$
BEGIN
  -- Check if the view already exists
  IF NOT EXISTS (
    SELECT FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'presale_stats' AND c.relkind = 'v'
  ) THEN
    -- Create the view if it doesn't exist (without status filter since column doesn't exist)
    EXECUTE '
      CREATE VIEW public.presale_stats AS
      SELECT 
        1 as id,
        COALESCE(SUM(c.amount), 0) as total_raised,
        COUNT(DISTINCT c.wallet_address) as contributors,
        75 as cap,
        CURRENT_TIMESTAMP as last_updated
      FROM public.contributions c
    ';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Call the function to create the view
SELECT create_presale_stats_view();

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
        amount
        -- Removed transaction_id, tier, status since they don't exist
      )
      VALUES (
        '4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh', -- Treasury wallet itself
        difference
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

-- Function to get contribution stats (ensure this exists)
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
ALTER PUBLICATION supabase_realtime ADD TABLE public.contributions;

-- Grant appropriate permissions
GRANT EXECUTE ON FUNCTION public.update_presale_stats_from_treasury TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_contribution_stats TO postgres, anon, authenticated, service_role;
GRANT SELECT ON public.presale_stats TO postgres, anon, authenticated, service_role; 