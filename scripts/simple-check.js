require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  try {
    console.log('Checking for contributions table...');
    
    // Try to select from the table
    const { data, error } = await supabase
      .from('contributions')
      .select('*')
      .limit(1);
      
    if (error) {
      console.error('Error accessing contributions table:', error);
    } else {
      console.log('Table exists!');
      
      if (data && data.length > 0) {
        console.log('Sample record:');
        console.log(data[0]);
        console.log('\nColumns in the table:');
        console.log(Object.keys(data[0]));
      } else {
        console.log('Table exists but has no data');
        
        // Create a temporary record to see the structure
        console.log('\nAttempting to create a test record to determine structure...');
        const { data: insertData, error: insertError } = await supabase
          .from('contributions')
          .insert({
            wallet_address: 'TEST_ADDRESS',
            amount: 1.0,
            transaction_id: 'TEST_TX_ID',
            tier: 'test'
          })
          .select();
          
        if (insertError) {
          console.error('Error creating test record:', insertError);
          console.log('Error details might reveal column structure:');
          console.log(insertError);
        } else {
          console.log('Test record created successfully!');
          console.log('Columns in the table:');
          console.log(Object.keys(insertData[0]));
          
          // Clean up test data
          await supabase
            .from('contributions')
            .delete()
            .eq('transaction_id', 'TEST_TX_ID');
        }
      }
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