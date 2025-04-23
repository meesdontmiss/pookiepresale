require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  try {
    console.log('=== Checking Database Structure ===\n');
    
    // Step 1: List all tables in the database
    console.log('Listing all tables in the database...');
    const { data: tables, error: tablesError } = await supabase.rpc('list_tables');
    
    if (tablesError) {
      console.error('Error listing tables:', tablesError);
      
      // Try a direct query approach instead
      console.log('\nTrying direct query via fetch...');
      const result = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json'
        }
      });
      
      if (result.ok) {
        const data = await result.json();
        console.log('Tables found:', data);
      } else {
        console.error('Direct fetch failed:', await result.text());
      }
    } else {
      console.log('Tables found:');
      console.log(tables);
    }
    
    // Step 2: Try to create contributions table if it doesn't exist
    console.log('\nAttempting to create contributions table if needed...');
    const createTableResult = await supabase.from('contributions').select('count').limit(1);
    
    if (createTableResult.error) {
      console.error('Error accessing contributions table:', createTableResult.error);
      
      console.log('\nTrying to create table via SQL...');
      // Try using a single insert to test if the table exists
      const { data: insertResult, error: insertError } = await supabase
        .from('contributions')
        .insert([
          { 
            wallet_address: 'test_wallet',
            amount: 0.001
          }
        ]);
        
      if (insertError) {
        console.error('Insert test failed:', insertError);
      } else {
        console.log('Table seems to exist! Test insert successful.');
      }
    } else {
      console.log('Contributions table exists!', createTableResult.data);
    }
    
    // Step 3: Check if RLS is enabled
    console.log('\nChecking Row Level Security settings...');
    try {
      // Try to access the table without authentication
      const publicResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?limit=1`, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Accept': 'application/json'
        }
      });
      
      if (publicResponse.ok) {
        console.log('Public access allowed - RLS might not be restricting access.');
      } else {
        console.log('Public access restricted:', await publicResponse.text());
      }
      
      // Try with authentication
      const authResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?limit=1`, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Accept': 'application/json'
        }
      });
      
      if (authResponse.ok) {
        const data = await authResponse.json();
        console.log('Authenticated access allowed!');
        if (data && data.length > 0) {
          console.log('Sample data:', data);
          console.log('Column structure:', Object.keys(data[0]));
        } else {
          console.log('No data found in table.');
        }
      } else {
        console.log('Authenticated access restricted:', await authResponse.text());
      }
    } catch (error) {
      console.error('Error checking RLS:', error);
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