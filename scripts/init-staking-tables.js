#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('\x1b[31mError: Supabase URL or service role key not found in environment variables.\x1b[0m');
  console.error('Please make sure you have the following variables in your .env.local file:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL');
  console.error('  SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function initStakingTables() {
  try {
    console.log('\x1b[34m=== Initializing NFT Staking Tables ===\x1b[0m');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'sql', 'staking_create_tables.sql');
    
    if (!fs.existsSync(sqlPath)) {
      console.error(`\x1b[31mError: SQL file not found at ${sqlPath}\x1b[0m`);
      process.exit(1);
    }
    
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute the SQL to create the function
    console.log('\x1b[34mCreating staking tables function...\x1b[0m');
    const { error: functionError } = await supabase.rpc('create_sql_function', {
      sql_code: sql
    });
    
    if (functionError) {
      console.error('\x1b[31mError creating function:\x1b[0m', functionError);
      
      // Try an alternative approach using direct SQL
      console.log('\x1b[33mAttempting alternative approach...\x1b[0m');
      
      // Execute SQL directly
      const { error: directError } = await supabase.rpc('exec_sql', {
        sql_statement: sql
      });
      
      if (directError) {
        console.error('\x1b[31mError with alternative approach:\x1b[0m', directError);
        return false;
      }
    }
    
    // Call the function to create the tables
    console.log('\x1b[34mExecuting function to create tables...\x1b[0m');
    const { error: execError } = await supabase.rpc('create_nft_staking_tables');
    
    if (execError) {
      console.error('\x1b[31mError executing function:\x1b[0m', execError);
      return false;
    }
    
    console.log('\x1b[32m✓ NFT staking tables initialized successfully!\x1b[0m');
    return true;
  } catch (error) {
    console.error('\x1b[31mUnexpected error:\x1b[0m', error);
    return false;
  }
}

// Check if tables exist
async function checkTablesExist() {
  try {
    // Try to query the nft_staking_records table
    const { data: recordsData, error: recordsError } = await supabase
      .from('nft_staking_records')
      .select('id')
      .limit(1);
    
    // Try to query the nft_staking_claims table
    const { data: claimsData, error: claimsError } = await supabase
      .from('nft_staking_claims')
      .select('id')
      .limit(1);
    
    const missingTables = [];
    
    if (recordsError && recordsError.code === '42P01') {
      // Error code 42P01 means "relation does not exist"
      missingTables.push('nft_staking_records');
    }
    
    if (claimsError && claimsError.code === '42P01') {
      missingTables.push('nft_staking_claims');
    }
    
    return {
      allExist: missingTables.length === 0,
      missingTables
    };
  } catch (error) {
    console.error('\x1b[31mError checking tables:\x1b[0m', error);
    return {
      allExist: false,
      missingTables: ['nft_staking_records', 'nft_staking_claims']
    };
  }
}

// Main function
async function main() {
  // Check if tables already exist
  const { allExist, missingTables } = await checkTablesExist();
  
  if (allExist) {
    console.log('\x1b[32m✓ All NFT staking tables already exist!\x1b[0m');
    process.exit(0);
  }
  
  console.log(`\x1b[33mMissing tables: ${missingTables.join(', ')}\x1b[0m`);
  
  // Initialize the tables
  const success = await initStakingTables();
  
  if (success) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

// Run the script
main(); 