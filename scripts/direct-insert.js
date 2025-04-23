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
    console.log('=== POOKIE Direct API Insert ===\n');
    
    // Step 1: Get the current treasury balance
    console.log('Getting current treasury balance...');
    const treasuryPubkey = new PublicKey(treasuryWallet);
    const balance = await connection.getBalance(treasuryPubkey);
    const solBalance = balance / 1e9; // Convert lamports to SOL
    
    console.log(`Current treasury balance: ${solBalance.toFixed(4)} SOL`);
    
    // Generate a unique ID for this import
    const uniqueId = `direct-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Step 2: Insert directly using the REST API
    console.log('\nInserting contribution directly via REST API...');
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
        timestamp: new Date().toISOString(),
        transaction_signature: uniqueId
      })
    });
    
    if (insertResponse.ok) {
      const result = await insertResponse.json();
      console.log('Insert successful:', result);
    } else {
      const errorText = await insertResponse.text();
      console.error('Error inserting via REST API:', errorText);
      
      // Step 3: Attempt to check what fields are supported
      console.log('\nChecking table structure via REST API...');
      const schemaResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?limit=1`, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });
      
      if (schemaResponse.ok) {
        const data = await schemaResponse.json();
        if (data && data.length > 0) {
          console.log('Table structure inferred from data:');
          console.log(Object.keys(data[0]));
        } else {
          console.log('Table exists but no data found');
        }
      } else {
        console.error('Error checking schema:', await schemaResponse.text());
      }
    }
    
    // Step 4: Try a simplified insert with minimal fields
    console.log('\nTrying minimal insert...');
    const minimalResponse = await fetch(`${supabaseUrl}/rest/v1/contributions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        wallet_address: treasuryWallet,
        amount: solBalance
      })
    });
    
    if (minimalResponse.ok) {
      const result = await minimalResponse.json();
      console.log('Minimal insert successful:', result);
    } else {
      console.error('Error with minimal insert:', await minimalResponse.text());
    }
    
    // Step 5: Check current contributions
    console.log('\nChecking current contributions...');
    const getResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?order=id.desc&limit=5`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    if (getResponse.ok) {
      const contributions = await getResponse.json();
      if (contributions && contributions.length > 0) {
        console.log('Recent contributions:');
        contributions.forEach(c => {
          const walletPreview = c.wallet_address ? c.wallet_address.substring(0, 8) + '...' : 'N/A';
          console.log(`ID: ${c.id}, Wallet: ${walletPreview}, Amount: ${c.amount} SOL`);
        });
      } else {
        console.log('No contributions found');
      }
    } else {
      console.error('Error getting contributions:', await getResponse.text());
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