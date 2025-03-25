# Pookie Presale Production Checklist

This document outlines the necessary steps to prepare your Pookie Presale application for production deployment.

## Environment Variables

Create a `.env.local` file in your production environment with the following variables:

```bash
# Database
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Admin Access
ADMIN_PASSWORD=your_secure_admin_password

# Blockchain Configuration
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_TREASURY_WALLET=your_treasury_wallet_address
NEXT_PUBLIC_NETWORK=mainnet

# Presale Configuration
NEXT_PUBLIC_PRESALE_CAP=75
NEXT_PUBLIC_TOKEN_SUPPLY=1000000000
NEXT_PUBLIC_PRESALE_ALLOCATION=50000000
NEXT_PUBLIC_MIN_CONTRIBUTION=0.25

# Security
NEXT_PUBLIC_RATE_LIMIT_REQUESTS=10
NEXT_PUBLIC_RATE_LIMIT_DURATION=60
NEXT_PUBLIC_SECURE_COOKIE=true

# Site Configuration
NEXT_PUBLIC_SITE_URL=https://your-production-site.com
```

## Vercel Deployment

1. Connect your GitHub repository to Vercel
2. Add all the environment variables in the Vercel dashboard
3. Deploy the application to production

## Database Configuration

1. Make sure your Supabase database has the necessary tables created:
   - `presale_contributions`
   - `vesting_options`
   - `vesting_schedules`
   - `distribution_records`

2. Ensure the database functions are deployed:
   - `calculate_token_allocations`
   - `process_contribution_with_vesting`
   - `get_presale_distribution_stats`

3. Configure database policies for secure access

## Security Precautions

1. Admin password must be strong and secure
2. Treasury wallet address must be correct
3. RPC endpoint should handle the expected load
4. Rate limiting should be enabled to prevent abuse

## Production Mode Specific Changes

The application has been updated to use production values:

1. **Real-time Notifications**: Notifications for live transactions are enabled
2. **Presale Tracker**: The presale tracker is set to start from 0 and displays real-time progress
3. **Transaction Verification**: All transactions are verified on-chain before being recorded
4. **Vesting Setup**: Token vesting lockups are properly tracked

## Final Pre-Launch Checks

1. **Test a small transaction**: Verify the entire flow from beginning to end
2. **Check admin dashboard**: Ensure all statistics are reporting correctly
3. **Verify token calculations**: Confirm token allocations are calculated correctly
4. **Responsive design**: Test on various devices and screen sizes
5. **Error handling**: Verify all error states are handled gracefully

## Post-Launch Monitoring

1. Monitor the Supabase database for any issues
2. Keep an eye on transaction verification failures
3. Check admin dashboard periodically for abnormal activity
4. Have a backup plan in case of unexpected issues

## Contact Information

For technical support during the launch, contact the development team at:
- Email: [your-support-email]
- Discord: [discord-channel] 