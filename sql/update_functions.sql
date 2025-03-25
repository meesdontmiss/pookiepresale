-- This script updates the token allocation functions with support for the 1 billion token supply

-- Drop the existing function first
DROP FUNCTION IF EXISTS public.calculate_token_allocations(numeric, numeric, numeric);

-- Create the updated version with new parameter names and billion token support
CREATE OR REPLACE FUNCTION public.calculate_token_allocations(
  p_total_supply NUMERIC DEFAULT 1000000000, -- 1 billion default
  p_presale_allocation_percentage NUMERIC DEFAULT 5, -- 5% of total for presale 
  p_min_contribution NUMERIC DEFAULT 0
) RETURNS INTEGER AS $$
DECLARE
  total_contributions NUMERIC;
  presale_tokens NUMERIC;
  tokens_per_sol NUMERIC;
  max_sol_cap NUMERIC;
  updated_count INTEGER;
BEGIN
  -- Input validation
  IF p_total_supply <= 0 THEN
    RAISE EXCEPTION 'Token supply must be greater than zero';
  END IF;
  
  IF p_presale_allocation_percentage <= 0 OR p_presale_allocation_percentage > 100 THEN
    RAISE EXCEPTION 'Presale allocation percentage must be between 0 and 100';
  END IF;
  
  IF p_min_contribution < 0 THEN
    RAISE EXCEPTION 'Minimum contribution cannot be negative';
  END IF;

  -- Calculate tokens available for presale distribution
  presale_tokens := FLOOR(p_total_supply * (p_presale_allocation_percentage / 100));
  
  -- Get the total contribution amount
  SELECT COALESCE(SUM(total_contributed), 0) INTO total_contributions
  FROM public.distribution_records
  WHERE total_contributed >= p_min_contribution;
  
  -- Set max SOL cap based on current contributions or default to 50
  max_sol_cap := GREATEST(total_contributions, 50);
  
  -- Calculate tokens per SOL
  tokens_per_sol := FLOOR(presale_tokens / max_sol_cap);
  
  -- Update token allocations based on contribution amount and vesting bonus
  IF total_contributions > 0 THEN
    UPDATE public.distribution_records
    SET 
      -- Base token allocation (without bonus)
      token_allocation = FLOOR(total_contributed * tokens_per_sol),
      -- Calculate vesting tokens with bonus
      vesting_tokens = CASE
        WHEN vesting_bonus_percentage > 0 THEN 
          FLOOR(total_contributed * tokens_per_sol * (1 + vesting_bonus_percentage::NUMERIC / 100))
        ELSE 
          FLOOR(total_contributed * tokens_per_sol)
      END
    WHERE total_contributed >= p_min_contribution;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the team allocation function to use 1 billion token supply
DROP FUNCTION IF EXISTS public.add_team_allocation(text, numeric, integer);

CREATE OR REPLACE FUNCTION public.add_team_allocation(
  p_wallet_address TEXT,
  p_allocation_percentage NUMERIC,
  p_vesting_days INTEGER DEFAULT 0
) RETURNS BOOLEAN AS $$
DECLARE
  v_vesting_start_date TIMESTAMP WITH TIME ZONE;
  v_vesting_end_date TIMESTAMP WITH TIME ZONE;
  v_total_percentage NUMERIC;
  v_total_supply NUMERIC := 1000000000; -- 1 billion default
  v_token_amount NUMERIC;
BEGIN
  -- Input validation
  IF p_wallet_address IS NULL OR LENGTH(p_wallet_address) < 32 OR LENGTH(p_wallet_address) > 44 THEN
    RAISE EXCEPTION 'Invalid wallet address';
  END IF;
  
  IF p_allocation_percentage <= 0 THEN
    RAISE EXCEPTION 'Allocation percentage must be greater than zero';
  END IF;
  
  -- Check if adding this allocation would exceed 100%
  SELECT COALESCE(SUM(allocation_percentage), 0) INTO v_total_percentage
  FROM public.team_allocations;
  
  IF v_total_percentage + p_allocation_percentage > 100 THEN
    RAISE EXCEPTION USING MESSAGE = format('Team allocations cannot exceed 100%% (current total: %s, adding: %s)', 
      v_total_percentage, p_allocation_percentage);
  END IF;
  
  -- Set vesting dates
  v_vesting_start_date := NOW();
  v_vesting_end_date := public.calculate_vesting_end_date(v_vesting_start_date, p_vesting_days);
  
  -- Calculate token amount based on percentage of total supply
  v_token_amount := FLOOR(v_total_supply * (p_allocation_percentage / 100));
  
  -- Insert the team allocation
  INSERT INTO public.team_allocations (
    wallet_address,
    token_amount,
    allocation_percentage,
    vesting_days,
    vesting_start_date,
    vesting_end_date
  )
  VALUES (
    p_wallet_address,
    v_token_amount,
    p_allocation_percentage,
    p_vesting_days,
    v_vesting_start_date,
    v_vesting_end_date
  );
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update vesting options to match the new bonus percentages
UPDATE public.vesting_options 
SET bonus_percentage = CASE
  WHEN days = 0 THEN 0
  WHEN days = 1 THEN 5
  WHEN days = 3 THEN 15
  WHEN days = 5 THEN 30
  WHEN days = 7 THEN 50
  ELSE bonus_percentage
END,
updated_at = NOW()
WHERE is_active = true;

-- Grant permissions for the updated functions
GRANT EXECUTE ON FUNCTION public.calculate_token_allocations TO pookie_admin;
GRANT EXECUTE ON FUNCTION public.add_team_allocation TO pookie_admin; 