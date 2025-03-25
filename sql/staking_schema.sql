-- Staking schema for Pookie Presale
-- This file contains the database schema for token and NFT staking functionality

-- Token staking records table
CREATE TABLE IF NOT EXISTS staking_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT NOT NULL,
  amount DECIMAL(18, 9) NOT NULL CHECK (amount > 0),
  days INTEGER NOT NULL CHECK (days > 0 AND days <= 30),
  bonus_percentage INTEGER NOT NULL CHECK (bonus_percentage >= 0 AND bonus_percentage <= 100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  unlock_date TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'cancelled')),
  
  -- Reference to contribution
  CONSTRAINT fk_wallet_address
    FOREIGN KEY (wallet_address)
    REFERENCES distribution_records(wallet_address)
    ON DELETE CASCADE
);

-- Create index on wallet address for faster queries
CREATE INDEX IF NOT EXISTS idx_staking_wallet_address
  ON staking_records(wallet_address);

-- NFT staking records table
CREATE TABLE IF NOT EXISTS nft_staking_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT NOT NULL,
  mint TEXT NOT NULL,
  staked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  days_staked INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Enforce uniqueness of wallet + mint combination
  CONSTRAINT unique_wallet_mint UNIQUE (wallet_address, mint)
);

-- Create index on wallet address for faster queries
CREATE INDEX IF NOT EXISTS idx_nft_staking_wallet_address
  ON nft_staking_records(wallet_address);

-- NFT staking claims table
CREATE TABLE IF NOT EXISTS nft_staking_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  transaction_hash TEXT
);

-- Create index on wallet address for faster queries
CREATE INDEX IF NOT EXISTS idx_nft_claims_wallet_address
  ON nft_staking_claims(wallet_address);

-- Function to calculate token staking bonuses
CREATE OR REPLACE FUNCTION calculate_staking_bonus(
  p_amount DECIMAL,
  p_days INTEGER
) RETURNS DECIMAL AS $$
DECLARE
  bonus_percentage INTEGER;
BEGIN
  -- Determine bonus percentage based on days
  IF p_days >= 7 THEN
    bonus_percentage := 50;
  ELSIF p_days >= 5 THEN
    bonus_percentage := 30;
  ELSIF p_days >= 3 THEN
    bonus_percentage := 15;
  ELSIF p_days >= 1 THEN
    bonus_percentage := 5;
  ELSE
    bonus_percentage := 0;
  END IF;
  
  -- Return total amount including bonus
  RETURN p_amount * (1 + (bonus_percentage::DECIMAL / 100));
END;
$$ LANGUAGE plpgsql;

-- Function to get total staked amount by wallet
CREATE OR REPLACE FUNCTION get_wallet_staked_amount(
  p_wallet_address TEXT
) RETURNS DECIMAL AS $$
DECLARE
  staked_amount DECIMAL;
BEGIN
  SELECT COALESCE(SUM(amount), 0)
  INTO staked_amount
  FROM staking_records
  WHERE wallet_address = p_wallet_address
    AND status = 'active';
  
  RETURN staked_amount;
END;
$$ LANGUAGE plpgsql;

-- Function to check if a wallet has enough unstaked contribution to stake
CREATE OR REPLACE FUNCTION can_stake_amount(
  p_wallet_address TEXT,
  p_amount DECIMAL
) RETURNS BOOLEAN AS $$
DECLARE
  total_contribution DECIMAL;
  staked_amount DECIMAL;
  available_amount DECIMAL;
BEGIN
  -- Get total contribution
  SELECT COALESCE(total_contributed, 0)
  INTO total_contribution
  FROM distribution_records
  WHERE wallet_address = p_wallet_address;
  
  -- Get amount already staked
  SELECT get_wallet_staked_amount(p_wallet_address)
  INTO staked_amount;
  
  -- Calculate available amount
  available_amount := total_contribution - staked_amount;
  
  RETURN p_amount <= available_amount;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security
ALTER TABLE staking_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE nft_staking_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE nft_staking_claims ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Users can only view their own staking records
CREATE POLICY staking_select_policy ON staking_records
  FOR SELECT
  USING (wallet_address = auth.uid());

-- Users can only insert their own staking records
CREATE POLICY staking_insert_policy ON staking_records
  FOR INSERT
  WITH CHECK (wallet_address = auth.uid() AND can_stake_amount(wallet_address, amount));

-- NFT staking policies
CREATE POLICY nft_staking_select_policy ON nft_staking_records
  FOR SELECT
  USING (wallet_address = auth.uid());

CREATE POLICY nft_staking_insert_policy ON nft_staking_records
  FOR INSERT
  WITH CHECK (wallet_address = auth.uid());

CREATE POLICY nft_staking_delete_policy ON nft_staking_records
  FOR DELETE
  USING (wallet_address = auth.uid());

-- NFT claims policies
CREATE POLICY nft_claims_select_policy ON nft_staking_claims
  FOR SELECT
  USING (wallet_address = auth.uid());

CREATE POLICY nft_claims_insert_policy ON nft_staking_claims
  FOR INSERT
  WITH CHECK (wallet_address = auth.uid());

-- Admin policies (using service role, not auth)
CREATE POLICY admin_staking_policy ON staking_records
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY admin_nft_staking_policy ON nft_staking_records
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY admin_nft_claims_policy ON nft_staking_claims
  FOR ALL
  USING (auth.role() = 'service_role'); 