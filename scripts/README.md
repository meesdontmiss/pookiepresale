# POOKIE Presale Scripts

This directory contains utility scripts for managing the POOKIE token presale, including importing transactions and monitoring the treasury wallet.

## Quick Start

Run the setup script to get started:

```bash
node scripts/setup.js
```

This interactive setup script will:
1. Check for required files and create them if missing
2. Install necessary dependencies
3. Guide you through setting up the SQL functions
4. Help you verify your configuration

## Available Scripts

### 1. `import-transactions.js`

A one-time script to import recent Solana blockchain transactions into the Supabase database.

#### Prerequisites

- Node.js v16+
- The following environment variables in your `.env.local` file:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_TREASURY_WALLET`
  - `SOLANA_RPC_URL` (Optional, defaults to public endpoint)

#### Installation

```bash
npm install @supabase/supabase-js @solana/web3.js dotenv
```

#### Usage

1. Create a `scripts` directory if it doesn't exist:
   ```bash
   mkdir -p scripts
   ```

2. Run the script from your project root:
   ```bash
   node scripts/import-transactions.js
   ```

#### How It Works

The script:
1. Connects to Supabase and Solana blockchain
2. Checks for each transaction in the list to avoid duplicates
3. Retrieves transaction details from Solana
4. Calculates balance changes to the treasury
5. Identifies sender wallets
6. Classifies contribution tier based on amount
7. Inserts valid contributions into the database
8. Updates presale statistics

#### Customization

Modify the `recentTransactions` array in the script to include different transaction signatures.

#### Troubleshooting

- **Connection errors**: Check your `.env.local` file for correct Supabase credentials
- **Authorization errors**: Ensure your Supabase anonymous key has the necessary permissions
- **Rate limiting**: If you encounter rate limiting from Solana RPC, use a dedicated RPC provider

#### Future Enhancements

- Automatic transaction retrieval based on date range
- Batch processing for large transaction sets

### 2. `monitor-treasury.js`

A continuous monitoring script that tracks the treasury wallet balance in real-time and updates the Supabase database accordingly.

#### Prerequisites

- Node.js v16+
- The same environment variables required for the import script
- The SQL functions from `treasury-functions.sql` must be installed in your Supabase database

#### Installation

```bash
npm install @supabase/supabase-js @solana/web3.js dotenv node-schedule
```

#### Usage

1. First, run the SQL functions script in your Supabase SQL Editor:
   ```bash
   # Copy the contents of treasury-functions.sql to your Supabase SQL Editor and execute
   ```

2. Start the monitoring script:
   ```bash
   node scripts/monitor-treasury.js
   ```

3. For production use, consider using a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start scripts/monitor-treasury.js --name "treasury-monitor"
   ```

#### How It Works

The monitoring script:
1. Connects to both Supabase and Solana
2. Periodically checks the treasury wallet balance (default: every 60 seconds)
3. When the balance increases, it updates the presale statistics
4. Creates special contribution records to account for any untracked contributions
5. Provides real-time updates to the presale progress display

#### Configuration Options

Edit these values at the top of the script to customize its behavior:
- `UPDATE_INTERVAL_MS`: How often to check for balance changes (default: 60000ms)
- `MAX_SOL_CAP`: The maximum SOL cap for the presale (default: 75)

#### Troubleshooting

- **Constant CPU Usage**: Increase the `UPDATE_INTERVAL_MS` value
- **Missing Transactions**: The script will create reconciliation entries but check your process for recording individual contributions

### 3. `check-stats.js`

A utility script to check the current contribution statistics and verify that the recorded contributions match the actual treasury wallet balance.

#### Prerequisites

- Node.js v16+
- The same environment variables required for the other scripts

#### Installation

```bash
npm install @supabase/supabase-js @solana/web3.js dotenv
```

#### Usage

Run the script from your project root:
```bash
node scripts/check-stats.js
```

#### What It Does

The script:
1. Fetches contribution statistics from the Supabase database
2. Checks the actual treasury wallet balance on the Solana blockchain
3. Compares the recorded contributions with the actual balance
4. Identifies any discrepancies between recorded and actual values
5. Shows the most recent contributions with details

This script is useful for verifying data integrity and quickly checking the current presale status without having to access the Supabase dashboard or run manual queries.

### 4. `setup.js`

An interactive setup script that helps you install and configure all the necessary components for the POOKIE presale scripts.

#### Usage

```bash
node scripts/setup.js
```

#### What It Does

The script:
1. Checks if the required directories exist and creates them if needed
2. Verifies if the `.env.local` file exists and offers to create a template
3. Installs all necessary dependencies (`@supabase/supabase-js`, `@solana/web3.js`, etc.)
4. Provides guidance on setting up the SQL functions in Supabase
5. Offers to run the `check-stats.js` script to verify everything is working

This script is particularly useful for new developers joining the project or when setting up in a new environment.

### 5. `visualize-presale.js`

A visual console dashboard for monitoring the POOKIE presale progress with ASCII charts and graphs.

#### Prerequisites

- Node.js v16+
- The same environment variables required for the other scripts

#### Installation

```bash
npm install @supabase/supabase-js @solana/web3.js dotenv
```

#### Usage

Run the script from your project root:
```bash
node scripts/visualize-presale.js
```

#### What It Does

The script creates a beautiful console-based dashboard that includes:

1. A visual progress bar showing how close the presale is to its target
2. Key metrics including total raised, number of contributors, and average contribution
3. Bar charts showing contribution distribution by tier
4. A timeline chart showing contribution activity over time
5. Recent activity log with the most recent contributions
6. Real-time comparison between recorded contributions and actual treasury balance

This visualization tool is perfect for getting a quick overview of the presale progress without having to access the web interface or Supabase dashboard.

## SQL Functions (`treasury-functions.sql`)

This file contains SQL functions to be installed in your Supabase project:

- `create_presale_stats_view()`: Creates a view for presale statistics
- `update_presale_stats_from_treasury()`: Updates stats based on treasury balance
- `get_contribution_stats()`: Retrieves current presale statistics

To install these functions:
1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Copy the contents of `treasury-functions.sql`
4. Run the SQL script

## Deployment Recommendations

For production environments:
1. Use PM2 or a similar process manager for monitoring scripts
2. Set up logging to capture script output
3. Configure error notifications
4. Consider setting up a cron job to restart the monitoring scripts daily 