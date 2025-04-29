-- Function to create NFT staking tables if they don't exist
CREATE OR REPLACE FUNCTION create_nft_staking_tables()
RETURNS VOID AS $$
BEGIN
  -- Create nft_staking_records table if it doesn't exist
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'nft_staking_records') THEN
    CREATE TABLE public.nft_staking_records (
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
      ON public.nft_staking_records(wallet_address);
    
    -- Enable Row Level Security
    ALTER TABLE public.nft_staking_records ENABLE ROW LEVEL SECURITY;
    
    -- Create policies
    -- Users can only view their own staking records
    CREATE POLICY nft_staking_select_policy ON public.nft_staking_records
      FOR SELECT
      USING (wallet_address = auth.uid());
    
    -- Users can only insert their own staking records
    CREATE POLICY nft_staking_insert_policy ON public.nft_staking_records
      FOR INSERT
      WITH CHECK (wallet_address = auth.uid());
    
    -- Users can only delete their own staking records
    CREATE POLICY nft_staking_delete_policy ON public.nft_staking_records
      FOR DELETE
      USING (wallet_address = auth.uid());
      
    -- Admin policies (using service role, not auth)
    CREATE POLICY admin_nft_staking_policy ON public.nft_staking_records
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
  
  -- Create nft_staking_claims table if it doesn't exist
  IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'nft_staking_claims') THEN
    CREATE TABLE public.nft_staking_claims (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      wallet_address TEXT NOT NULL,
      amount INTEGER NOT NULL CHECK (amount > 0),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
      transaction_hash TEXT
    );
    
    -- Create index on wallet address for faster queries
    CREATE INDEX IF NOT EXISTS idx_nft_claims_wallet_address
      ON public.nft_staking_claims(wallet_address);
    
    -- Enable Row Level Security
    ALTER TABLE public.nft_staking_claims ENABLE ROW LEVEL SECURITY;
    
    -- Create policies
    -- Users can only view their own claims
    CREATE POLICY nft_claims_select_policy ON public.nft_staking_claims
      FOR SELECT
      USING (wallet_address = auth.uid());
    
    -- Users can only insert their own claims
    CREATE POLICY nft_claims_insert_policy ON public.nft_staking_claims
      FOR INSERT
      WITH CHECK (wallet_address = auth.uid());
      
    -- Admin policies (using service role, not auth)
    CREATE POLICY admin_nft_claims_policy ON public.nft_staking_claims
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END;
$$ LANGUAGE plpgsql; 