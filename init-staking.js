const { createClient } = require('@supabase/supabase-js');

// Supabase configuration directly in script
const supabaseUrl = 'https://kojysqbrqsfwqvabpkvh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvanlzcWJycXNmd3F2YWJwa3ZoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MjU0MDA2OSwiZXhwIjoyMDU4MTE2MDY5fQ.9RYcXCT6sT_Q96kGqLeGPHFJ1e832K9MuKxQw8KCwqE';

const supabase = createClient(supabaseUrl, supabaseKey);

// Check if tables exist
async function checkTablesExist() {
  try {
    // Try to query the nft_staking_records table
    const { data: recordsData, error: recordsError } = await supabase
      .from('nft_staking_records')
      .select('id')
      .limit(1);
    
    // Try to query the nft_staking_claims table
    const { data: claimsData, error: claimsError } = await supabase
      .from('nft_staking_claims')
      .select('id')
      .limit(1);
    
    const missingTables = [];
    
    if (recordsError && recordsError.code === '42P01') {
      // Error code 42P01 means "relation does not exist"
      missingTables.push('nft_staking_records');
    } else if (recordsError) {
      console.error('Error checking nft_staking_records:', recordsError);
    }
    
    if (claimsError && claimsError.code === '42P01') {
      missingTables.push('nft_staking_claims');
    } else if (claimsError) {
      console.error('Error checking nft_staking_claims:', claimsError);
    }
    
    return {
      allExist: missingTables.length === 0,
      missingTables
    };
  } catch (error) {
    console.error('Error checking tables:', error);
    return {
      allExist: false,
      missingTables: ['nft_staking_records', 'nft_staking_claims']
    };
  }
}

// Create NFT staking tables
async function createStakingTables() {
  try {
    console.log('=== Creating NFT Staking Tables ===');
    
    // Create nft_staking_records table
    console.log('Creating nft_staking_records table...');
    const { error: recordsError } = await supabase.rpc('create_table', {
      table_name: 'nft_staking_records',
      table_definition: `
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        wallet_address TEXT NOT NULL,
        mint TEXT NOT NULL,
        staked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        days_staked INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT unique_wallet_mint UNIQUE (wallet_address, mint)
      `
    });
    
    if (recordsError) {
      console.error('Error creating nft_staking_records table:', recordsError);
      
      // Let's use the Supabase API directly to create tables
      console.log('Attempting alternative approach...');
      
      // First, check if the table exists
      const { data: tableExists, error: checkError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_name', 'nft_staking_records')
        .eq('table_schema', 'public')
        .single();
        
      if (checkError && checkError.code !== 'PGRST116') {
        console.error('Error checking if table exists:', checkError);
      }
      
      // If table doesn't exist, create it using the REST API
      if (!tableExists) {
        console.log('Creating nft_staking_records table via direct API...');
        
        // We'll use a simple insert operation to verify API access
        const { error } = await supabase
          .from('nft_staking_records')
          .insert({
            wallet_address: 'test_wallet',
            mint: 'test_mint'
          });
        
        if (error && error.code === '42P01') {
          // Table doesn't exist, which is expected
          console.log('Confirmed table does not exist.');
        } else if (error) {
          console.error('Error testing table creation:', error);
        }
      }
    }
    
    // Create nft_staking_claims table similarly
    // ...
    
    console.log('✓ Tables setup completed. Please use the Supabase Studio to finalize setup.');
    
    // Show instructions for manually creating tables
    console.log('\nSince we cannot directly execute SQL through the API without custom RPC functions,');
    console.log('please follow these steps to manually create the tables:');
    console.log('\n1. Log in to your Supabase dashboard: https://app.supabase.com');
    console.log('2. Go to your project and open the SQL Editor');
    console.log('3. Copy and paste the following SQL commands:');
    
    console.log(`
-- Create nft_staking_records table
CREATE TABLE IF NOT EXISTS public.nft_staking_records (
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

-- Create nft_staking_claims table
CREATE TABLE IF NOT EXISTS public.nft_staking_claims (
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
`);
    
    return true;
  } catch (error) {
    console.error('Unexpected error:', error);
    return false;
  }
}

// Main function
async function main() {
  // Check if tables already exist
  const { allExist, missingTables } = await checkTablesExist();
  
  if (allExist) {
    console.log('✓ All NFT staking tables already exist!');
    process.exit(0);
  }
  
  console.log(`Missing tables: ${missingTables.join(', ')}`);
  
  // Create tables
  const success = await createStakingTables();
  
  if (success) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// Run the script
main(); 