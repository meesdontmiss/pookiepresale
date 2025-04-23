require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');
const { Connection, PublicKey } = require('@solana/web3.js');

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Initialize Solana connection
const solanaRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(solanaRpc);

// Treasury wallet address
const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET || '4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh';

async function main() {
  try {
    console.log('=== POOKIE Presale Statistics ===\n');
    
    // Step 1: Check contributions summary
    console.log('Checking contributions summary...');
    const summaryResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?select=count,sum(amount)`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (summaryResponse.ok) {
      const summary = await summaryResponse.json();
      if (summary && summary.length > 0) {
        console.log(`Total contributions: ${summary[0].count}`);
        console.log(`Total amount raised: ${summary[0].sum} SOL`);
      } else {
        console.log('No contribution data found');
      }
    } else {
      console.error('Error getting summary:', await summaryResponse.text());
    }
    
    // Step 2: Check unique contributors
    console.log('\nChecking unique contributors...');
    const contributorsResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?select=wallet_address&order=wallet_address`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    if (contributorsResponse.ok) {
      const contributors = await contributorsResponse.json();
      const uniqueWallets = new Set(contributors.map(c => c.wallet_address));
      console.log(`Unique contributors: ${uniqueWallets.size}`);
    } else {
      console.error('Error getting contributors:', await contributorsResponse.text());
    }
    
    // Step 3: Check presale_stats view
    console.log('\nChecking presale_stats view...');
    const statsResponse = await fetch(`${supabaseUrl}/rest/v1/presale_stats?limit=1`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      if (stats && stats.length > 0) {
        console.log('Presale stats:');
        console.log(`Total raised: ${stats[0].total_raised} SOL`);
        console.log(`Contributors: ${stats[0].contributors}`);
        console.log(`Cap: ${stats[0].cap} SOL`);
        console.log(`Progress: ${(stats[0].total_raised / stats[0].cap * 100).toFixed(2)}%`);
        console.log(`Last updated: ${stats[0].last_updated}`);
      } else {
        console.log('No presale stats found');
      }
    } else {
      console.error('Error getting presale stats:', await statsResponse.text());
      
      // Try to create the view
      console.log('\nAttempting to create presale_stats view...');
      const createViewQuery = `
        CREATE OR REPLACE VIEW public.presale_stats AS
        SELECT 
          1 as id,
          COALESCE(SUM(c.amount), 0) as total_raised,
          COUNT(DISTINCT c.wallet_address) as contributors,
          75 as cap,
          CURRENT_TIMESTAMP as last_updated
        FROM public.contributions c
      `;
      
      const createResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        },
        body: JSON.stringify({ query: createViewQuery })
      });
      
      if (createResponse.ok) {
        console.log('Successfully created presale_stats view!');
      } else {
        console.error('Error creating view:', await createResponse.text());
      }
    }
    
    // Step 4: Check current treasury balance
    console.log('\nChecking actual treasury balance...');
    try {
      const treasuryPubkey = new PublicKey(treasuryWallet);
      const balance = await connection.getBalance(treasuryPubkey);
      const solBalance = balance / 1e9; // Convert lamports to SOL
      
      console.log(`Current treasury balance: ${solBalance.toFixed(4)} SOL`);
    } catch (error) {
      console.error('Error getting treasury balance:', error);
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