require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { Connection, PublicKey } = require('@solana/web3.js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create both a standard and admin client
const supabase = createClient(supabaseUrl, supabaseKey);
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

// Initialize Solana connection
const solanaRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(solanaRpc);

// Treasury wallet address
const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET;

async function main() {
  try {
    console.log('=== POOKIE Presale Verification and Fix ===\n');
    
    // Step 1: Check if the table exists
    console.log('Step 1: Checking if contributions table exists...');
    const { data: tableExists, error: tableError } = await supabase
      .from('contributions')
      .select('id')
      .limit(1);
      
    if (tableError && tableError.code === '42P01') {
      console.log('Contributions table does not exist. Creating it...');
      
      // Create the table using the admin client
      const { error: createError } = await supabaseAdmin.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS public.contributions (
            id SERIAL PRIMARY KEY,
            wallet_address TEXT NOT NULL,
            amount NUMERIC NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `
      });
      
      if (createError) {
        console.error('Error creating table:', createError);
        // Try direct SQL approach
        console.log('Attempting direct query...');
        const { error: directError } = await supabaseAdmin
          .from('contributions')
          .insert([{ wallet_address: treasuryWallet, amount: 0.001 }]);
          
        if (directError) {
          console.error('Error with direct approach:', directError);
          console.log('Please run the SQL script from treasury-functions-final.sql in the Supabase dashboard.');
          return;
        }
      } else {
        console.log('Table created successfully!');
      }
    } else {
      console.log('Contributions table exists.');
    }
    
    // Step 2: Add created_at column if it doesn't exist
    console.log('\nStep 2: Checking for created_at column...');
    const { error: addColumnError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public'
                       AND table_name = 'contributions'
                       AND column_name = 'created_at') THEN
            ALTER TABLE public.contributions ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
          END IF;
        END $$;
      `
    });
    
    if (addColumnError) {
      console.error('Error checking/adding created_at column:', addColumnError);
      console.log('Please run the SQL script from treasury-functions-final.sql in the Supabase dashboard to add the column.');
    } else {
      console.log('created_at column exists or was added successfully.');
    }
    
    // Step 3: Try to create presale_stats view
    console.log('\nStep 3: Creating presale_stats view...');
    const { error: viewError } = await supabaseAdmin.rpc('exec_sql', {
      sql: `
        DROP VIEW IF EXISTS public.presale_stats;
        CREATE VIEW public.presale_stats AS
        SELECT
          1 as id,
          COALESCE(SUM(c.amount), 0) as total_raised,
          COUNT(DISTINCT c.wallet_address) as contributors,
          75 as cap,
          CURRENT_TIMESTAMP as last_updated
        FROM public.contributions c;
      `
    });
    
    if (viewError) {
      console.error('Error creating presale_stats view:', viewError);
      console.log('Please run the SQL script from treasury-functions-final.sql in the Supabase dashboard.');
    } else {
      console.log('presale_stats view created successfully.');
    }
    
    // Step 4: Get the current treasury balance
    console.log('\nStep 4: Checking current treasury balance...');
    try {
      const treasuryPubkey = new PublicKey(treasuryWallet);
      const balance = await connection.getBalance(treasuryPubkey);
      const solBalance = balance / 1e9; // Convert lamports to SOL
      
      console.log(`Current treasury balance: ${solBalance.toFixed(4)} SOL`);
      
      // Step 5: Get current recorded contributions
      console.log('\nStep 5: Checking recorded contributions...');
      const { data: contributions, error: contribError } = await supabase
        .from('contributions')
        .select('amount, wallet_address');
        
      if (contribError) {
        console.error('Error fetching contributions:', contribError);
      } else {
        const total = contributions ? contributions.reduce((sum, record) => sum + parseFloat(record.amount), 0) : 0;
        const contributors = contributions ? new Set(contributions.map(c => c.wallet_address)).size : 0;
        
        console.log(`Recorded total: ${total.toFixed(4)} SOL`);
        console.log(`Contributors: ${contributors}`);
        
        // Step 6: Synchronize if there's a difference
        if (Math.abs(solBalance - total) > 0.001) {
          console.log(`\nStep 6: Treasury balance (${solBalance.toFixed(4)} SOL) differs from recorded total (${total.toFixed(4)} SOL).`);
          
          const difference = solBalance - total;
          console.log(`Difference: ${difference.toFixed(4)} SOL`);
          
          console.log('Adding record to account for the difference...');
          const { data: insertData, error: insertError } = await supabase
            .from('contributions')
            .insert({
              wallet_address: treasuryWallet,
              amount: difference
            });
            
          if (insertError) {
            console.error('Error adding sync record:', insertError);
          } else {
            console.log('Successfully synchronized balance!');
          }
        } else {
          console.log('\nStep 6: Treasury balance matches recorded total. No synchronization needed.');
        }
      }
    } catch (error) {
      console.error('Error checking Solana balance:', error);
    }
    
    // Final verification
    console.log('\nFinal verification...');
    const { data: finalStats, error: finalError } = await supabase
      .from('presale_stats')
      .select('*')
      .single();
      
    if (finalError) {
      console.error('Error fetching final stats:', finalError);
      console.log('Please run the SQL script from treasury-functions-final.sql in the Supabase dashboard.');
    } else {
      console.log('\nPresale statistics:');
      console.log(`Total raised: ${finalStats.total_raised} SOL`);
      console.log(`Contributors: ${finalStats.contributors}`);
      console.log(`Progress: ${((finalStats.total_raised / finalStats.cap) * 100).toFixed(2)}%`);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
    console.log('Please run the SQL script from treasury-functions-final.sql in the Supabase dashboard to set up all required tables and functions.');
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