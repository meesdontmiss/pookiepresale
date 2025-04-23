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
    console.log('=== POOKIE Database Rebuild ===\n');
    
    // Step 1: Check if contributions table exists and attempt to read it
    console.log('Checking contributions table...');
    const { data: contribCount, error: countError } = await supabase
      .from('contributions')
      .select('count');
      
    if (countError) {
      console.error('Error checking contributions table:', countError);
    } else {
      console.log(`Found contributions table with count: ${contribCount[0]?.count || 0}`);
    }
    
    // Step 2: Get the current treasury balance
    console.log('\nGetting current treasury balance...');
    const treasuryPubkey = new PublicKey(treasuryWallet);
    const balance = await connection.getBalance(treasuryPubkey);
    const solBalance = balance / 1e9; // Convert lamports to SOL
    
    console.log(`Current treasury balance: ${solBalance.toFixed(4)} SOL`);
    
    // Step 3: Try different insertion approaches
    console.log('\nAttempting to insert with various field combinations...');
    
    // Generate a unique ID for this import
    const uniqueId = Date.now().toString();
    
    // Array of different field combinations to try
    const attempts = [
      {
        name: "Basic fields only",
        data: {
          wallet_address: treasuryWallet,
          amount: solBalance
        }
      },
      {
        name: "With transaction_signature",
        data: {
          wallet_address: treasuryWallet,
          amount: solBalance,
          transaction_signature: `import-${uniqueId}-1`
        }
      },
      {
        name: "With timestamp",
        data: {
          wallet_address: treasuryWallet,
          amount: solBalance,
          timestamp: new Date().toISOString()
        }
      },
      {
        name: "With transaction_id",
        data: {
          wallet_address: treasuryWallet,
          amount: solBalance,
          transaction_id: `import-${uniqueId}-3`
        }
      },
      {
        name: "Full combination",
        data: {
          wallet_address: treasuryWallet,
          amount: solBalance,
          transaction_signature: `import-${uniqueId}-4`,
          timestamp: new Date().toISOString(),
          is_verified: true,
          contribution_tier: 'auto'
        }
      }
    ];
    
    // Try each approach
    for (const attempt of attempts) {
      console.log(`\nTrying approach: ${attempt.name}`);
      const { data: insertData, error: insertError } = await supabase
        .from('contributions')
        .insert(attempt.data);
        
      if (insertError) {
        console.error(`Error with approach "${attempt.name}":`, insertError);
      } else {
        console.log(`SUCCESS with approach "${attempt.name}"!`);
      }
    }
    
    // Step 4: Check what was actually inserted
    console.log('\nVerifying what was inserted...');
    const { data: contributions, error: verifyError } = await supabase
      .from('contributions')
      .select('*')
      .order('id', { ascending: false })
      .limit(10);
      
    if (verifyError) {
      console.error('Error verifying contributions:', verifyError);
    } else if (contributions && contributions.length > 0) {
      console.log('Recent contributions:');
      console.log('Available fields for first record:', Object.keys(contributions[0]));
      
      contributions.forEach(c => {
        console.log(`ID: ${c.id}, Wallet: ${c.wallet_address ? c.wallet_address.substring(0, 8) + '...' : 'N/A'}, Amount: ${c.amount} SOL`);
      });
    } else {
      console.log('No contributions found');
    }
    
    // Step 5: Try to create the presale_stats view if it doesn't exist
    console.log('\nAttempting to create presale_stats view...');
    const { data: viewData, error: viewError } = await supabase
      .from('presale_stats')
      .select('*')
      .limit(1);
      
    if (viewError) {
      console.error('Error accessing presale_stats view:', viewError);
      
      console.log('Attempting to create the view directly...');
      // Try to create the view directly - this requires elevated permissions
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
      
      const { error: createViewError } = await supabase
        .rpc('exec_sql', { query: createViewQuery });
        
      if (createViewError) {
        console.error('Error creating view:', createViewError);
      } else {
        console.log('Successfully created presale_stats view!');
      }
    } else {
      console.log('presale_stats view already exists!', viewData);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

main()
  .then(() => {
    console.log('\nDatabase rebuild attempts complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  }); 