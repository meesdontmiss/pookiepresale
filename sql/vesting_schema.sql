-- Add vesting periods support to the schema

-- Create vesting_options table to define available lock-up periods
CREATE TABLE IF NOT EXISTS public.vesting_options (
  id SERIAL PRIMARY KEY,
  days INTEGER NOT NULL CHECK (days >= 0),
  bonus_percentage INTEGER NOT NULL CHECK (bonus_percentage >= 0),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT unique_vesting_days UNIQUE (days)
);

-- Insert initial vesting options with updated bonus percentages
-- Align with frontend vesting options
INSERT INTO public.vesting_options (days, bonus_percentage)
VALUES 
  (0, 0),    -- No lock-up, 0% bonus
  (1, 10),   -- 1-day lock-up, 10% bonus
  (3, 20),   -- 3-day lock-up, 20% bonus
  (5, 30),   -- 5-day lock-up, 30% bonus
  (7, 40)    -- 7-day lock-up, 40% bonus
ON CONFLICT (days) DO UPDATE
SET bonus_percentage = EXCLUDED.bonus_percentage,
    updated_at = NOW();

-- Update contributions table to include vesting lock-up period
ALTER TABLE public.contributions
ADD COLUMN IF NOT EXISTS vesting_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS vesting_bonus_percentage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS vesting_end_date TIMESTAMP WITH TIME ZONE;

-- Update distribution_records table to include vesting information
ALTER TABLE public.distribution_records
ADD COLUMN IF NOT EXISTS vesting_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS vesting_bonus_percentage INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS vesting_tokens NUMERIC(20, 0) DEFAULT 0,
ADD COLUMN IF NOT EXISTS vesting_start_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS vesting_end_date TIMESTAMP WITH TIME ZONE;

-- Create a function to calculate vesting end date
CREATE OR REPLACE FUNCTION public.calculate_vesting_end_date(start_date TIMESTAMP WITH TIME ZONE, days INTEGER)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
BEGIN
  RETURN start_date + (days * INTERVAL '1 day');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a function to process a contribution with vesting information
CREATE OR REPLACE FUNCTION public.process_contribution_with_vesting(
  p_wallet_address TEXT,
  p_amount NUMERIC,
  p_transaction_id TEXT,
  p_vesting_days INTEGER DEFAULT 0,
  p_vesting_bonus_percentage INTEGER DEFAULT NULL,
  p_vesting_end_date TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  p_tier TEXT DEFAULT 'public'
) RETURNS JSONB AS $$
DECLARE
  v_vesting_bonus_percentage INTEGER;
  v_vesting_start_date TIMESTAMP WITH TIME ZONE;
  v_vesting_end_date TIMESTAMP WITH TIME ZONE;
  v_contribution_id INTEGER;
BEGIN
  -- Input validation
  IF p_wallet_address IS NULL OR LENGTH(p_wallet_address) < 32 OR LENGTH(p_wallet_address) > 44 THEN
    RAISE EXCEPTION 'Invalid wallet address';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  
  IF p_transaction_id IS NULL OR LENGTH(p_transaction_id) = 0 THEN
    RAISE EXCEPTION 'Transaction ID is required';
  END IF;
  
  -- If bonus percentage is not provided, get it from the vesting_options table
  IF p_vesting_bonus_percentage IS NULL THEN
    SELECT bonus_percentage 
    INTO v_vesting_bonus_percentage
    FROM public.vesting_options
    WHERE days = p_vesting_days AND is_active = TRUE;
    
    -- Use 0% if the vesting period doesn't exist or is not active
    IF v_vesting_bonus_percentage IS NULL THEN
      v_vesting_bonus_percentage := 0;
    END IF;
  ELSE
    v_vesting_bonus_percentage := p_vesting_bonus_percentage;
  END IF;
  
  -- Set vesting dates
  v_vesting_start_date := NOW();
  
  -- Use provided end date if available, otherwise calculate it
  IF p_vesting_end_date IS NOT NULL THEN
    v_vesting_end_date := p_vesting_end_date;
  ELSIF p_vesting_days > 0 THEN
    v_vesting_end_date := public.calculate_vesting_end_date(v_vesting_start_date, p_vesting_days);
  ELSE
    v_vesting_end_date := NULL;
  END IF;
  
  -- Insert the contribution
  INSERT INTO public.contributions (
    wallet_address,
    amount,
    transaction_id,
    tier,
    vesting_days,
    vesting_bonus_percentage,
    vesting_end_date
  )
  VALUES (
    p_wallet_address,
    p_amount,
    p_transaction_id,
    p_tier,
    p_vesting_days,
    v_vesting_bonus_percentage,
    v_vesting_end_date
  )
  RETURNING id INTO v_contribution_id;
  
  -- Update the distribution record
  INSERT INTO public.distribution_records (
    wallet_address,
    total_contributed,
    vesting_days,
    vesting_bonus_percentage,
    vesting_start_date,
    vesting_end_date,
    updated_at
  )
  VALUES (
    p_wallet_address,
    p_amount,
    p_vesting_days,
    v_vesting_bonus_percentage,
    v_vesting_start_date,
    v_vesting_end_date,
    NOW()
  )
  ON CONFLICT (wallet_address) 
  DO UPDATE SET
    total_contributed = distribution_records.total_contributed + p_amount,
    -- Only update vesting if the new period is longer than the existing one
    vesting_days = GREATEST(distribution_records.vesting_days, p_vesting_days),
    vesting_bonus_percentage = CASE
      WHEN p_vesting_days > distribution_records.vesting_days THEN v_vesting_bonus_percentage
      ELSE distribution_records.vesting_bonus_percentage
    END,
    vesting_start_date = CASE
      WHEN distribution_records.vesting_start_date IS NULL THEN v_vesting_start_date
      ELSE distribution_records.vesting_start_date
    END,
    vesting_end_date = CASE
      WHEN p_vesting_days > distribution_records.vesting_days THEN v_vesting_end_date
      ELSE distribution_records.vesting_end_date
    END,
    updated_at = NOW();
    
  -- Return contribution ID and details
  RETURN jsonb_build_object(
    'contribution_id', v_contribution_id,
    'wallet_address', p_wallet_address,
    'amount', p_amount,
    'vesting_days', p_vesting_days,
    'vesting_bonus_percentage', v_vesting_bonus_percentage,
    'vesting_end_date', v_vesting_end_date
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- Create a new table to track team allocations
CREATE TABLE IF NOT EXISTS public.team_allocations (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  token_amount NUMERIC(20, 0) NOT NULL CHECK (token_amount > 0),
  allocation_percentage NUMERIC(5, 2) NOT NULL CHECK (allocation_percentage > 0),
  vesting_days INTEGER DEFAULT 0, -- No default lock-up for team members
  vesting_start_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  vesting_end_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_wallet_address CHECK (LENGTH(wallet_address) >= 32 AND LENGTH(wallet_address) <= 44)
);

-- Create a function to add team member allocations
-- Team members have no default vesting period
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

-- Grant permissions for the pookie_admin role
GRANT ALL ON public.vesting_options TO pookie_admin;
GRANT USAGE, SELECT ON SEQUENCE public.vesting_options_id_seq TO pookie_admin;
GRANT EXECUTE ON FUNCTION public.calculate_vesting_end_date TO pookie_admin;
GRANT EXECUTE ON FUNCTION public.process_contribution_with_vesting TO pookie_admin;
GRANT EXECUTE ON FUNCTION public.calculate_token_allocations TO pookie_admin;
GRANT ALL ON public.team_allocations TO pookie_admin;
GRANT USAGE, SELECT ON SEQUENCE public.team_allocations_id_seq TO pookie_admin; 