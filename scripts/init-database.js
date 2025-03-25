#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: '.env.local' })

// Configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local')
  process.exit(1)
}

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Read SQL schema file
const schemaPath = path.join(__dirname, '../sql/schema.sql')
const schemaSql = fs.readFileSync(schemaPath, 'utf8')

// Split the SQL into individual statements
const statements = schemaSql
  .split(';')
  .map(statement => statement.trim())
  .filter(statement => statement.length > 0)

async function initDatabase() {
  console.log('Initializing database...')
  
  try {
    // Execute each SQL statement
    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 50)}...`)
      
      const { error } = await supabase.rpc('exec_sql', {
        sql_query: statement + ';'
      })
      
      if (error) {
        console.error(`Error executing SQL: ${error.message}`)
      }
    }
    
    console.log('Database initialization completed!')
  } catch (error) {
    console.error('Error initializing database:', error)
  }
}

// Run the initialization
initDatabase() 