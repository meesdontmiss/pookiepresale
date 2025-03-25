-- Enable Row Level Security
-- Use a secure, random JWT secret in production
ALTER DATABASE postgres SET "app.jwt_secret" TO '{{REPLACE_WITH_SECURE_JWT_SECRET}}';

-- Create contributions table
CREATE TABLE IF NOT EXISTS public.contributions (
  id SERIAL PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  amount NUMERIC(20, 9) NOT NULL,
  transaction_id TEXT UNIQUE,
  tier TEXT DEFAULT 'public',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_amount CHECK (amount > 0),
  CONSTRAINT valid_wallet_address CHECK (LENGTH(wallet_address) >= 32 AND LENGTH(wallet_address) <= 44)
);

-- Create distribution_records table for tracking total contributions per wallet
CREATE TABLE IF NOT EXISTS public.distribution_records (
  wallet_address TEXT PRIMARY KEY,
  total_contributed NUMERIC(20, 9) DEFAULT 0,
  token_allocation NUMERIC(20, 0) DEFAULT 0,
  distribution_status TEXT DEFAULT 'pending',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT valid_wallet_address CHECK (LENGTH(wallet_address) >= 32 AND LENGTH(wallet_address) <= 44)
);

-- Create airdrop batches table
CREATE TABLE IF NOT EXISTS public.airdrop_batches (
  batch_id SERIAL PRIMARY KEY,
  batch_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  distributed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  transaction_hash TEXT DEFAULT NULL,
  
  CONSTRAINT valid_batch_name CHECK (LENGTH(batch_name) > 0 AND LENGTH(batch_name) <= 255)
);

-- Create airdrop recipients table
CREATE TABLE IF NOT EXISTS public.airdrop_recipients (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES public.airdrop_batches(batch_id),
  wallet_address TEXT REFERENCES public.distribution_records(wallet_address),
  token_amount NUMERIC(20, 0) NOT NULL CHECK (token_amount > 0),
  status TEXT DEFAULT 'pending',
  
  UNIQUE(batch_id, wallet_address)
);

-- Create stored procedures and functions

-- Create function to update distribution records
CREATE OR REPLACE FUNCTION public.update_distribution_record(
  p_wallet_address TEXT,
  p_amount NUMERIC
) RETURNS BOOLEAN AS $$
BEGIN
  -- Input validation
  IF p_wallet_address IS NULL OR LENGTH(p_wallet_address) < 32 OR LENGTH(p_wallet_address) > 44 THEN
    RAISE EXCEPTION 'Invalid wallet address';
  END IF;
  
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;

  -- Insert or update the distribution record
  INSERT INTO public.distribution_records (
    wallet_address, 
    total_contributed,
    updated_at
  )
  VALUES (
    p_wallet_address,
    p_amount,
    NOW()
  )
  ON CONFLICT (wallet_address) 
  DO UPDATE SET
    total_contributed = distribution_records.total_contributed + p_amount,
    updated_at = NOW();
    
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get total contributions
CREATE OR REPLACE FUNCTION public.get_total_contributions()
RETURNS NUMERIC AS $$
DECLARE
  total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(total_contributed), 0) INTO total
  FROM public.distribution_records;
  
  RETURN total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to calculate allocation based on contributions
CREATE OR REPLACE FUNCTION public.calculate_token_allocations(
  token_supply NUMERIC,
  min_contribution NUMERIC DEFAULT 0
) RETURNS INTEGER AS $$
DECLARE
  total_contributions NUMERIC;
  updated_count INTEGER;
BEGIN
  -- Input validation
  IF token_supply <= 0 THEN
    RAISE EXCEPTION 'Token supply must be greater than zero';
  END IF;
  
  IF min_contribution < 0 THEN
    RAISE EXCEPTION 'Minimum contribution cannot be negative';
  END IF;

  -- Get the total contribution amount
  SELECT COALESCE(SUM(total_contributed), 0) INTO total_contributions
  FROM public.distribution_records
  WHERE total_contributed >= min_contribution;
  
  -- Update token allocations proportionally to contributions
  IF total_contributions > 0 THEN
    UPDATE public.distribution_records
    SET token_allocation = FLOOR((total_contributed / total_contributions) * token_supply)
    WHERE total_contributed >= min_contribution;
    
    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
  ELSE
    RETURN 0;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to create an airdrop batch
CREATE OR REPLACE FUNCTION public.create_airdrop_batch(
  p_batch_name TEXT
) RETURNS INTEGER AS $$
DECLARE
  new_batch_id INTEGER;
BEGIN
  -- Input validation
  IF p_batch_name IS NULL OR LENGTH(p_batch_name) = 0 OR LENGTH(p_batch_name) > 255 THEN
    RAISE EXCEPTION 'Invalid batch name';
  END IF;

  INSERT INTO public.airdrop_batches (batch_name)
  VALUES (p_batch_name)
  RETURNING batch_id INTO new_batch_id;
  
  RETURN new_batch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to populate airdrop batch with recipients
CREATE OR REPLACE FUNCTION public.populate_airdrop_batch(
  p_batch_id INTEGER,
  p_min_tokens NUMERIC DEFAULT 0
) RETURNS INTEGER AS $$
DECLARE
  recipient_count INTEGER;
  batch_exists BOOLEAN;
BEGIN
  -- Input validation
  IF p_batch_id <= 0 THEN
    RAISE EXCEPTION 'Invalid batch ID';
  END IF;
  
  IF p_min_tokens < 0 THEN
    RAISE EXCEPTION 'Minimum token amount cannot be negative';
  END IF;
  
  -- Check if batch exists
  SELECT EXISTS(
    SELECT 1 FROM public.airdrop_batches WHERE batch_id = p_batch_id
  ) INTO batch_exists;
  
  IF NOT batch_exists THEN
    RAISE EXCEPTION 'Batch does not exist';
  END IF;

  -- Add recipients with token allocation to the batch
  INSERT INTO public.airdrop_recipients (
    batch_id,
    wallet_address,
    token_amount,
    status
  )
  SELECT 
    p_batch_id,
    wallet_address,
    token_allocation,
    'pending'
  FROM public.distribution_records
  WHERE token_allocation > p_min_tokens
  AND wallet_address NOT IN (
    SELECT wallet_address FROM public.airdrop_recipients
    WHERE batch_id = p_batch_id
  );
  
  GET DIAGNOSTICS recipient_count = ROW_COUNT;
  RETURN recipient_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to mark batch as distributed
CREATE OR REPLACE FUNCTION public.mark_batch_distributed(
  p_batch_id INTEGER,
  p_transaction_hash TEXT
) RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
  batch_exists BOOLEAN;
BEGIN
  -- Input validation
  IF p_batch_id <= 0 THEN
    RAISE EXCEPTION 'Invalid batch ID';
  END IF;
  
  IF p_transaction_hash IS NULL OR LENGTH(p_transaction_hash) = 0 THEN
    RAISE EXCEPTION 'Transaction hash is required';
  END IF;
  
  -- Check if batch exists
  SELECT EXISTS(
    SELECT 1 FROM public.airdrop_batches WHERE batch_id = p_batch_id
  ) INTO batch_exists;
  
  IF NOT batch_exists THEN
    RAISE EXCEPTION 'Batch does not exist';
  END IF;

  -- Update the batch status
  UPDATE public.airdrop_batches
  SET distributed_at = NOW(),
      transaction_hash = p_transaction_hash
  WHERE batch_id = p_batch_id;
  
  -- Update all recipients in the batch
  UPDATE public.airdrop_recipients
  SET status = 'distributed'
  WHERE batch_id = p_batch_id;
  
  -- Update distribution records
  UPDATE public.distribution_records
  SET distribution_status = 'distributed'
  WHERE wallet_address IN (
    SELECT wallet_address FROM public.airdrop_recipients
    WHERE batch_id = p_batch_id
  );
  
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get contribution statistics
CREATE OR REPLACE FUNCTION public.get_contribution_stats()
RETURNS TABLE (
  total_amount NUMERIC,
  contributor_count BIGINT,
  avg_contribution NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(total_contributed), 0) as total_amount,
    COUNT(*) as contributor_count,
    CASE
      WHEN COUNT(*) > 0 THEN COALESCE(SUM(total_contributed), 0) / COUNT(*)
      ELSE 0
    END as avg_contribution
  FROM public.distribution_records;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable Row Level Security
ALTER TABLE public.contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribution_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airdrop_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.airdrop_recipients ENABLE ROW LEVEL SECURITY;

-- Create more secure policies
-- Only allow select on specific tables for public access
CREATE POLICY "Public can only view distribution totals" 
ON public.distribution_records FOR SELECT USING (true);

CREATE POLICY "Public can only view batch info"
ON public.airdrop_batches FOR SELECT USING (true);

-- Create policies for contribution records
-- Only users who own the wallet or authenticated admins can see contributions
CREATE POLICY "Users can only read their own contributions"
ON public.contributions FOR SELECT
USING (wallet_address = current_user OR current_user = 'authenticator');

-- Only admins can write to the database
CREATE POLICY "Only admins can insert contributions"
ON public.contributions FOR INSERT
WITH CHECK (current_user = 'authenticator');

CREATE POLICY "Only admins can update contributions"
ON public.contributions FOR UPDATE
USING (current_user = 'authenticator');

-- Create admin role for managing the database with more secure permissions
DROP ROLE IF EXISTS pookie_admin;
CREATE ROLE pookie_admin WITH NOLOGIN;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO pookie_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO pookie_admin;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO pookie_admin;

-- Create a trigger to validate and sanitize wallet addresses
CREATE OR REPLACE FUNCTION sanitize_wallet_address()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Check if wallet address is valid format
    IF NEW.wallet_address !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$' THEN
      RAISE EXCEPTION 'Invalid wallet address format';
    END IF;
    
    -- Trim to ensure no whitespace
    NEW.wallet_address = TRIM(NEW.wallet_address);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with wallet addresses
CREATE TRIGGER sanitize_contributions_wallet
BEFORE INSERT OR UPDATE ON public.contributions
FOR EACH ROW EXECUTE FUNCTION sanitize_wallet_address();

CREATE TRIGGER sanitize_distribution_wallet
BEFORE INSERT OR UPDATE ON public.distribution_records
FOR EACH ROW EXECUTE FUNCTION sanitize_wallet_address(); 