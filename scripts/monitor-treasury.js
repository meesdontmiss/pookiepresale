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

// Configuration
const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET;
const UPDATE_INTERVAL_MS = 60000; // Check every 60 seconds
const MAX_SOL_CAP = 75; // Maximum SOL cap

// Function to get treasury wallet balance
async function getTreasuryBalance() {
  try {
    const treasuryPubkey = new PublicKey(treasuryWallet);
    const balance = await connection.getBalance(treasuryPubkey);
    return balance / 1e9; // Convert lamports to SOL
  } catch (error) {
    console.error('Error fetching treasury balance:', error);
    return null;
  }
}

// Function to update presale statistics based on treasury balance
async function updatePresaleStats(treasuryBalance) {
  try {
    if (treasuryBalance === null) {
      console.log('Cannot update stats: Invalid treasury balance');
      return null;
    }
    
    // Get current stats from Supabase
    const { data: statsData, error: statsError } = await supabase
      .from('presale_stats')
      .select('*')
      .single();
      
    if (statsError) {
      console.error('Error fetching stats:', statsError);
      return null;
    }
    
    // Get total from contributions
    const { data: contributions, error: contributionsError } = await supabase
      .from('contributions')
      .select('amount');
      
    if (contributionsError) {
      console.error('Error fetching contributions:', contributionsError);
      return null;
    }
    
    const currentTotal = contributions.reduce((sum, c) => sum + parseFloat(c.amount), 0);
    
    // If treasury balance is greater than recorded total, update database
    if (treasuryBalance > currentTotal) {
      console.log(`Treasury balance (${treasuryBalance} SOL) is higher than recorded contributions (${currentTotal} SOL). Syncing...`);
      
      const difference = treasuryBalance - currentTotal;
      
      // Insert a special contribution record
      const { data: insertData, error: insertError } = await supabase
        .from('contributions')
        .insert({
          wallet_address: treasuryWallet,
          amount: difference,
          // No transaction_id, tier, or status fields
        });
        
      if (insertError) {
        console.error('Error inserting contribution record:', insertError);
        return null;
      }
      
      console.log(`Added ${difference} SOL to contributions to match treasury balance.`);
    }
    
    // Calculate progress percentage
    const progressPercentage = (treasuryBalance / MAX_SOL_CAP) * 100;
    
    // Return updated stats
    return {
      total_raised: treasuryBalance,
      progress_percentage: progressPercentage,
      cap: MAX_SOL_CAP,
      updated_at: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error updating presale stats:', error);
    return null;
  }
}

// Main function to monitor treasury wallet
async function monitorTreasury() {
  console.log(`Starting treasury monitoring for wallet: ${treasuryWallet}`);
  console.log(`Update interval: ${UPDATE_INTERVAL_MS / 1000} seconds`);
  
  // Initial check
  console.log('Performing initial balance check...');
  const initialBalance = await getTreasuryBalance();
  
  if (initialBalance !== null) {
    console.log(`Initial treasury balance: ${initialBalance} SOL`);
    const stats = await updatePresaleStats(initialBalance);
    
    if (stats) {
      console.log(`Updated presale stats: ${stats.total_raised} SOL (${stats.progress_percentage.toFixed(2)}% of cap)`);
    }
  }
  
  // Set up interval for continuous monitoring
  setInterval(async () => {
    console.log('Checking treasury balance...');
    const balance = await getTreasuryBalance();
    
    if (balance !== null) {
      console.log(`Current treasury balance: ${balance} SOL`);
      const stats = await updatePresaleStats(balance);
      
      if (stats) {
        console.log(`Updated presale stats: ${stats.total_raised} SOL (${stats.progress_percentage.toFixed(2)}% of cap)`);
      }
    }
  }, UPDATE_INTERVAL_MS);
  
  console.log('Treasury monitoring started. Press Ctrl+C to stop.');
}

// Start monitoring
monitorTreasury().catch(error => {
  console.error('Fatal error in monitoring:', error);
  process.exit(1);
}); 