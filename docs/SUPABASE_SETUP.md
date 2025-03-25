# Supabase Setup Guide for Pookie Presale

This guide will walk you through setting up Supabase for the Pookie Presale project.

## 1. Create a Supabase Project

1. Go to [Supabase](https://supabase.com/) and sign up or log in.
2. Create a new project and give it a name (e.g., "pookie-presale").
3. Choose a strong database password and save it securely.
4. Select a region closest to your target audience.
5. Wait for the database to be provisioned.

## 2. Get API Credentials

Once your project is created:

1. Go to the project dashboard.
2. Navigate to Settings > API in the sidebar.
3. Copy the following values:
   - **Project URL**: This is your `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key**: This is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key**: This is your `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

## 3. Set Up Environment Variables

1. Create or update the `.env.local` file in the root of your project with the following:

```
# Supabase Connection
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Solana Configuration
NEXT_PUBLIC_TREASURY_WALLET=your_treasury_wallet_address
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

Replace the placeholders with your actual values.

## 4. Set Up the Database Schema

There are two ways to set up the database schema:

### Option 1: Using the SQL Editor in Supabase

1. Go to the SQL Editor in your Supabase dashboard.
2. Create a new query.
3. First, run the SQL script in `sql/init-functions.sql` to create the execution function.
4. Then copy the entire contents of the `sql/schema.sql` file from this project.
5. Run the SQL script.

### Option 2: Using the Initialization Script

To use the initialization script, you first need to create the `exec_sql` function in Supabase:

1. Go to the SQL Editor in Supabase.
2. Copy and run the contents of `sql/init-functions.sql`.
3. Make sure your environment variables are set up correctly.
4. Install required dependencies:

```bash
npm install dotenv @supabase/supabase-js
```

5. Run the initialization script:

```bash
node scripts/init-database.js
```

## 5. Set Up RLS (Row Level Security)

Supabase applies Row Level Security by default. The SQL schema includes policies that:

1. Allow public read access to distribution records for transparency.
2. Restrict access to contribution details to the wallet owner or authenticated users.
3. Allow admin access to all tables.

## 6. Set Up Database Functions

The SQL schema includes several functions that are called by the application:

- `update_distribution_record`: Updates a wallet's total contribution amount.
- `get_total_contributions`: Returns the total amount of contributions.
- `calculate_token_allocations`: Calculates token allocations based on contribution amounts.
- `create_airdrop_batch`: Creates a new batch for airdrop distributions.
- `populate_airdrop_batch`: Adds recipients to an airdrop batch.
- `mark_batch_distributed`: Marks a batch as distributed.
- `get_contribution_stats`: Returns statistics about contributions.

## 7. Testing the Connection

To verify that your Supabase connection is working:

1. Run the application in development mode:

```bash
npm run dev
```

2. Navigate to the dashboard page at `/dashboard`
3. If you see contribution statistics loading correctly, your database connection is working.

## 8. Troubleshooting

If you encounter issues:

1. Check that your environment variables are correctly set.
2. Verify that your Supabase project is active.
3. Make sure the SQL schema was executed successfully.
4. Check the browser console for any errors related to Supabase.
5. Ensure your network allows connections to Supabase (no firewall blocking the API calls).

## 9. Production Deployment

When deploying to production:

1. Set the same environment variables in your hosting platform.
2. Consider using a dedicated Supabase project for production.
3. Review and potentially tighten the RLS policies for production use.
4. Set up monitoring and alerting for your Supabase project. 