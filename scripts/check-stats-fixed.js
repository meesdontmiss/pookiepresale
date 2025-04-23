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
const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET;

async function main() {
  try {
    console.log('=== POOKIE Presale Statistics ===');
    console.log('\nChecking Supabase contributions...');
    
    // Get statistics from Supabase
    const { data: stats, error } = await supabase
      .from('presale_stats')
      .select('*')
      .single();
      
    if (error) {
      console.error('Error fetching stats from Supabase:', error);
      
      // Try getting stats directly from contributions table
      const { data: contributions, error: contributionsError } = await supabase
        .from('contributions')
        .select('amount, wallet_address');
        
      if (contributionsError) {
        console.error('Error fetching contributions:', contributionsError);
      } else {
        const total = contributions.reduce((sum, record) => sum + parseFloat(record.amount), 0);
        const contributors = new Set(contributions.map(c => c.wallet_address)).size;
        
        console.log('\nContributions Summary:');
        console.log(`Total Raised: ${total.toFixed(4)} SOL`);
        console.log(`Contributors: ${contributors}`);
        console.log(`Progress: ${((total / 75) * 100).toFixed(2)}%`);
      }
    } else {
      console.log('\nPresale Statistics:');
      console.log(`Total Raised: ${stats.total_raised} SOL`);
      console.log(`Contributors: ${stats.contributors}`);
      console.log(`Progress: ${((stats.total_raised / stats.cap) * 100).toFixed(2)}%`);
      console.log(`Last Updated: ${new Date(stats.last_updated).toLocaleString()}`);
    }
    
    // Check actual treasury balance from Solana
    console.log('\nChecking actual treasury balance on Solana...');
    try {
      const treasuryPubkey = new PublicKey(treasuryWallet);
      const balance = await connection.getBalance(treasuryPubkey);
      const solBalance = balance / 1e9; // Convert lamports to SOL
      
      console.log(`Current Treasury Balance: ${solBalance.toFixed(4)} SOL`);
      
      // If we have stats, compare with recorded total
      if (stats) {
        const difference = solBalance - stats.total_raised;
        if (Math.abs(difference) > 0.001) {
          console.log(`\n⚠️ Discrepancy Detected: ${difference.toFixed(4)} SOL difference between`);
          console.log(`recorded contributions and actual treasury balance.`);
          console.log(`Consider running the import-transactions.js script to sync records.`);
        } else {
          console.log(`\n✅ Recorded contributions match treasury balance.`);
        }
      }
    } catch (solanaError) {
      console.error('Error checking Solana balance:', solanaError);
    }
    
    // Get most recent contributions
    console.log('\nMost Recent Contributions:');
    const { data: recentContributions, error: recentError } = await supabase
      .from('contributions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);
      
    if (recentError) {
      console.error('Error fetching recent contributions:', recentError);
    } else if (recentContributions.length === 0) {
      console.log('No contributions found.');
    } else {
      recentContributions.forEach(contribution => {
        console.log(
          `${new Date(contribution.created_at).toLocaleString()} | ` +
          `${contribution.wallet_address.substring(0, 4)}...${contribution.wallet_address.substring(contribution.wallet_address.length - 4)} | ` +
          `${contribution.amount} SOL`
        );
      });
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