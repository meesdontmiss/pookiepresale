require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  try {
    console.log('Attempting to insert a test record with basic fields...');
    
    // Try to insert a record with just the most basic fields
    const { data: insertData, error: insertError } = await supabase
      .from('contributions')
      .insert({
        wallet_address: 'TEST_ADDRESS',
        amount: 1.0,
        transaction_id: 'TEST_TX_ID'
        // No tier field
      })
      .select();
      
    if (insertError) {
      console.error('Error creating test record:', insertError);
      
      // Try a different combination of fields
      console.log('\nTrying with different fields...');
      const { data: insertData2, error: insertError2 } = await supabase
        .from('contributions')
        .insert({
          wallet_address: 'TEST_ADDRESS',
          amount: 1.0
          // No transaction_id, no tier
        })
        .select();
        
      if (insertError2) {
        console.error('Second attempt failed:', insertError2);
      } else {
        console.log('Second attempt successful!');
        console.log('Record:', insertData2[0]);
        console.log('Columns:', Object.keys(insertData2[0]));
      }
    } else {
      console.log('Test record created successfully!');
      console.log('Record:', insertData[0]);
      console.log('Columns:', Object.keys(insertData[0]));
    }
    
    // Now let's try to explicitly get the table structure with a RLS bypass query
    console.log('\nTrying to get table structure using service role key...');
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (serviceRoleKey) {
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
      
      // This query should run with privileges to view the table structure
      const { data, error } = await supabaseAdmin
        .from('contributions')
        .select('*')
        .limit(1);
        
      if (error) {
        console.error('Error with admin query:', error);
      } else {
        console.log('Admin query successful!');
        
        if (data && data.length > 0) {
          console.log('Sample record:', data[0]);
          console.log('Columns:', Object.keys(data[0]));
        } else {
          console.log('No data found');
          
          // Try a direct SQL query to get column info
          const { data: columnsData, error: columnsError } = await supabaseAdmin.rpc('table_info', {
            table_name: 'contributions'
          });
          
          if (columnsError) {
            console.error('Error getting column info:', columnsError);
          } else {
            console.log('Column info:', columnsData);
          }
        }
      }
    } else {
      console.log('No service role key found in .env.local');
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