-- Drop the function first to allow parameter name changes
DROP FUNCTION IF EXISTS public.calculate_token_allocations(numeric, numeric, numeric);

-- Update the calculate_token_allocations function to account for token supply settings
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

-- Grant permission for the function
GRANT EXECUTE ON FUNCTION public.calculate_token_allocations TO pookie_admin; 