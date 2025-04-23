# POOKIE Presale Management Tools

This collection of tools helps you manage your POOKIE token presale by synchronizing Solana blockchain transactions with your Supabase database and providing monitoring and visualization capabilities.

## 🎯 Features

- **Transaction Import**: Import recent Solana transactions to your Supabase database
- **Real-time Monitoring**: Monitor treasury wallet balance in real-time
- **Contribution Tracking**: Track individual contributions with details like wallet address and tier
- **Visual Dashboard**: View beautiful ASCII charts and graphs in your console
- **Stats Verification**: Verify that all contributions are properly recorded
- **Database Functions**: SQL functions for presale statistics and data integrity

## 🚀 Quick Start

1. Run the setup script:
   ```bash
   node scripts/setup.js
   ```

2. Follow the interactive prompts to:
   - Check/create necessary configuration files
   - Install required dependencies
   - Set up SQL functions in your Supabase project
   - Start using the tools

## 📊 Available Tools

### 1. Transaction Import

Import recent Solana blockchain transactions to your Supabase database:

```bash
node scripts/import-transactions.js
```

This ensures all contributions are properly recorded and reflected in the presale statistics.

### 2. Treasury Monitoring

Monitor the treasury wallet balance in real-time:

```bash
node scripts/monitor-treasury.js
```

This continuously tracks the wallet balance and updates the database accordingly.

### 3. Stats Verification

Check current contribution statistics and verify database integrity:

```bash
node scripts/check-stats.js
```

This tool helps you validate that all contributions are properly recorded.

### 4. Visual Dashboard

View a beautiful console dashboard with charts and graphs:

```bash
node scripts/visualize-presale.js
```

Get a visual overview of your presale progress, including:
- Progress bar toward target
- Contribution distribution by tier
- Timeline of contributions
- Recent activity log

## 🔧 SQL Functions

The `scripts/treasury-functions.sql` file provides essential database functions:

- Creation of the `presale_stats` view
- Functions to update presale statistics from treasury balance
- Functions to retrieve contribution stats
- Real-time functionality setup

## 📝 Requirements

- Node.js v16 or higher
- Supabase project with appropriate permissions
- Properly configured `.env.local` file with:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_TREASURY_WALLET`
  - `SOLANA_RPC_URL` (optional)

## 🌟 Advanced Usage

For production environments:

1. **Continuous Monitoring**: Use PM2 to keep the monitoring script running:
   ```bash
   npm install -g pm2
   pm2 start scripts/monitor-treasury.js --name "treasury-monitor"
   ```

2. **Scheduled Imports**: Set up cron jobs to regularly import new transactions:
   ```bash
   # Example cron job to run every hour
   0 * * * * cd /path/to/project && node scripts/import-transactions.js
   ```

3. **Dashboard Display**: Use a dedicated terminal window with the visualization tool for real-time stats:
   ```bash
   # Run in a dedicated terminal
   watch -n 60 node scripts/visualize-presale.js
   ```

## 📚 For More Information

Detailed documentation for each script is available in the `scripts/README.md` file.

## 🛠️ Troubleshooting

If you encounter issues:

1. Check that your `.env.local` file has the correct credentials
2. Verify that the SQL functions are properly installed in Supabase
3. Ensure your Supabase anonymous key has the necessary permissions
4. For rate limiting from Solana RPC, consider using a dedicated RPC provider 