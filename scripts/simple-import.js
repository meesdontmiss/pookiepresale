require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { Connection, PublicKey } = require('@solana/web3.js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Solana connection
const solanaRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(solanaRpc);

// Treasury wallet address
const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET || '4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh';

async function main() {
  try {
    console.log('=== POOKIE Treasury Import ===\n');
    
    // Step 1: Get the current treasury balance
    console.log('Getting current treasury balance...');
    const treasuryPubkey = new PublicKey(treasuryWallet);
    const balance = await connection.getBalance(treasuryPubkey);
    const solBalance = balance / 1e9; // Convert lamports to SOL
    
    console.log(`Current treasury balance: ${solBalance.toFixed(4)} SOL`);
    
    // Generate a unique transaction ID for this import
    const uniqueId = `import-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Step 2: Add a contribution record
    console.log('\nAdding contribution record...');
    const { data, error } = await supabase
      .from('contributions')
      .insert({
        wallet_address: treasuryWallet,
        amount: solBalance,
        transaction_id: uniqueId,           // Add this field to satisfy the constraint
        transaction_signature: uniqueId,    // This is the main field we want to use
        timestamp: new Date().toISOString(),
        is_verified: true
      });
    
    if (error) {
      console.error('Error adding contribution:', error);
      
      // Try a simpler approach
      console.log('\nTrying simpler approach...');
      const { error: simpleError } = await supabase
        .from('contributions')
        .insert([
          { 
            wallet_address: treasuryWallet, 
            amount: solBalance,
            transaction_id: uniqueId,
            transaction_signature: uniqueId,
            timestamp: new Date().toISOString()
          }
        ]);
        
      if (simpleError) {
        console.error('Simple approach failed:', simpleError);
      } else {
        console.log('Successfully added contribution!');
      }
    } else {
      console.log('Successfully added contribution!');
    }
    
    // Step 3: Check if the contribution was added
    console.log('\nVerifying contribution...');
    const { data: contributions, error: verifyError } = await supabase
      .from('contributions')
      .select('*')
      .order('id', { ascending: false })
      .limit(5);
      
    if (verifyError) {
      console.error('Error verifying contribution:', verifyError);
    } else if (contributions && contributions.length > 0) {
      console.log('Recent contributions:');
      console.log('Available fields in first record:', Object.keys(contributions[0]));
      
      contributions.forEach(c => {
        const walletPreview = c.wallet_address ? c.wallet_address.substring(0, 8) + '...' : 'N/A';
        console.log(`ID: ${c.id}, Wallet: ${walletPreview}, Amount: ${c.amount} SOL, Created: ${c.timestamp || 'N/A'}`);
      });
      
      // Step 4: Check the presale_stats view
      console.log('\nChecking presale stats...');
      const { data: stats, error: statsError } = await supabase
        .from('presale_stats')
        .select('*')
        .single();
        
      if (statsError) {
        console.error('Error getting presale stats:', statsError);
      } else {
        console.log('Presale stats:');
        console.log(`Total raised: ${stats.total_raised} SOL`);
        console.log(`Contributors: ${stats.contributors}`);
        console.log(`Progress: ${(stats.total_raised / stats.cap * 100).toFixed(2)}%`);
      }
    } else {
      console.log('No contributions found');
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

main()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  }); 