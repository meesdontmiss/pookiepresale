require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');
const { Connection, PublicKey } = require('@solana/web3.js');

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Solana configuration
const solanaRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(solanaRpc);

// Treasury wallet address
const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET || '4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh';

// Known recent contributions - enter these from Solscan manually if available
// Format: { signature, sender, amount, timestamp }
const knownContributions = [
  // We don't have the individual contributors yet - so we'll use the total balance
];

// Current treasury balance - confirmed from Solana
const currentTreasuryBalance = 12.2613; // SOL

// Presale goal 
const presaleGoal = 75; // SOL

async function main() {
  try {
    console.log('=== POOKIE Recent Contributions ===\n');
    
    // Step 1: Check the current treasury balance
    console.log('Checking current treasury balance...');
    const treasuryPubkey = new PublicKey(treasuryWallet);
    const balance = await connection.getBalance(treasuryPubkey);
    const solBalance = balance / 1e9; // Convert lamports to SOL
    
    console.log(`Current treasury balance: ${solBalance.toFixed(4)} SOL`);
    console.log(`Expected balance from configuration: ${currentTreasuryBalance.toFixed(4)} SOL`);
    
    // Calculate progress percentage
    const progress = (solBalance / presaleGoal) * 100;
    console.log(`Presale progress: ${progress.toFixed(2)}% of ${presaleGoal} SOL goal`);
    
    // Step 2: Get existing contributions
    console.log('\nFetching existing contributions...');
    const getResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?select=id,transaction_signature`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    if (!getResponse.ok) {
      console.error('Error fetching contributions:', await getResponse.text());
      return;
    }
    
    const existingContributions = await getResponse.json();
    console.log(`Found ${existingContributions.length} existing contribution(s)`);
    
    // Step 3: Delete existing contributions
    if (existingContributions.length > 0) {
      console.log('\nRemoving existing contributions...');
      
      for (const contribution of existingContributions) {
        const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?id=eq.${contribution.id}`, {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=minimal'
          }
        });
        
        if (!deleteResponse.ok) {
          console.error(`Error deleting contribution ${contribution.id}:`, await deleteResponse.text());
        } else {
          console.log(`Deleted contribution ID: ${contribution.id}`);
        }
      }
    }
    
    // Step 4: Add the actual balance as a contribution
    console.log('\nAdding the actual balance as a contribution...');
    
    const transactionId = `actual-balance-${Date.now()}`;
    
    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/contributions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        wallet_address: treasuryWallet,
        amount: solBalance,
        transaction_signature: transactionId,
        timestamp: new Date().toISOString(),
        is_verified: true
      })
    });
    
    if (!insertResponse.ok) {
      console.error('Error adding balance contribution:', await insertResponse.text());
      return;
    }
    
    const result = await insertResponse.json();
    console.log('Successfully added contribution with actual balance:', result);
    
    // Step 5: Verify the database state
    console.log('\nVerifying database state...');
    const statsResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?select=count(*),sum(amount)`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    if (!statsResponse.ok) {
      console.error('Error verifying database state:', await statsResponse.text());
      return;
    }
    
    const stats = await statsResponse.json();
    if (stats && stats.length > 0) {
      console.log('Database now shows:');
      console.log(`- Contributions: ${stats[0].count}`);
      console.log(`- Total amount: ${stats[0].sum || 0} SOL`);
      console.log(`- Progress: ${((stats[0].sum || 0) / presaleGoal * 100).toFixed(2)}%`);
    }
    
    console.log('\nVerifying balance matches Solana blockchain...');
    console.log(`Solana balance: ${solBalance.toFixed(4)} SOL`);
    console.log(`Database total: ${stats[0].sum || 0} SOL`);
    
    if (Math.abs(solBalance - (stats[0].sum || 0)) < 0.0001) {
      console.log('✅ Database balance matches Solana blockchain!');
    } else {
      console.log('❌ Database balance does not match Solana blockchain.');
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