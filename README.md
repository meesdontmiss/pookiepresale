# Pookie Presale App

A Next.js application for managing the Pookie token presale, featuring wallet integration, contribution tracking, and airdrop management.

## Features

- **Interactive 3D Scene**: Engaging user interface with a 3D Pookie model
- **Solana Wallet Integration**: Seamless connection to users' Solana wallets
- **Contribution Management**: Handle SOL contributions with confirmation and tracking
- **Admin Dashboard**: Monitor presale progress and manage contributor data
- **Airdrop Management**: Prepare and export token distribution data
- **Password Gating**: Restrict contribution limits with password protection

## Staking Features

The $POOKIE Presale includes built-in staking features to incentivize users to hold their tokens and NFTs:

### Token Staking
- Users can stake their presale allocation to receive bonus tokens
- Bonuses range from 5% to 50% based on staking duration:
  - 1 day: 5% bonus
  - 3 days: 15% bonus
  - 5 days: 30% bonus
  - 7 days: 50% bonus
- Staking locks the user's presale allocation until token launch
- All bonus tokens are distributed during the airdrop

### NFT Staking
- Users can stake Pookie NFTs to earn additional token rewards
- Each staked NFT earns 10 $POOKIE tokens per day
- Users can unstake NFTs and claim rewards at any time
- Rewards accumulate based on the number of days staked

### Setup Instructions
1. Run the SQL migration for staking tables:
   ```bash
   psql -U postgres -d pookie_presale -f sql/staking_schema.sql
   ```
   Or import the SQL directly through the Supabase dashboard

2. Make sure the `staking` route is accessible
3. NFT staking uses mock data by default - to connect to real NFTs, modify the `fetchUserNfts` function in `components/nft-staking.tsx`

### Staking Security
- All staking operations use Row Level Security (RLS) policies in Supabase
- Users can only view and manage their own staking records
- Functions enforce that users cannot stake more than their available contribution
- Staking operations are tracked with detailed audit logs

## Getting Started

### Prerequisites

- Node.js 16+ and npm
- Solana wallet (Phantom, Solflare, etc.)
- Supabase account for database services

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd pookie-presale
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables by creating a `.env.local` file:

```
# Supabase Connection
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Solana Configuration
NEXT_PUBLIC_TREASURY_WALLET=your_treasury_wallet_address
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Token Contract Variables (to be filled when token is deployed)
NEXT_PUBLIC_POOKIE_TOKEN_CONTRACT=""

# Token supply settings
NEXT_PUBLIC_TOKEN_TOTAL_SUPPLY="1000000000" # 1 billion POOKIE total supply
NEXT_PUBLIC_PRESALE_ALLOCATION_PERCENTAGE="5" # 5% of total supply allocated to presale
NEXT_PUBLIC_MAX_SOL_CAP="50" # Maximum SOL to be raised
```

4. Set up the Supabase database:

Follow the instructions in [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)

5. Run the development server:

```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

- `/app`: Next.js app router pages
- `/components`: React components
  - `/ui`: Basic UI components
  - `/admin`: Admin panel components
- `/hooks`: Custom React hooks
- `/public`: Static assets
- `/sql`: SQL schema and scripts
- `/scripts`: Utility scripts
- `/docs`: Project documentation

## Presale Flow

1. Users connect their Solana wallet
2. Users contribute SOL to the designated treasury wallet
3. Transactions are verified and recorded in the database
4. Admin can monitor contributions in real-time
5. After presale ends, admin prepares for token airdrop

## Admin Features

The admin dashboard is accessible at `/admin` with password protection:

- View all contributors and their contribution amounts
- Calculate token allocations based on total contributions
- Create and manage airdrop batches
- Export airdrop lists in CSV or JSON format

### Access the Admin Dashboard

1. Navigate to `/admin`
2. Enter the admin password (default: "adminpookie2024")

## Database Configuration

The project uses Supabase for database management with the following tables:

- `contributions`: Individual contribution records
- `distribution_records`: Total contributions per wallet
- `airdrop_batches`: Batches for token distribution
- `airdrop_recipients`: Recipients for each batch

## Development

### Adding New Features

1. Make changes to the codebase
2. Test locally
3. Build and deploy

### Running Tests

```bash
npm run test
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Three.js for 3D rendering
- Next.js for the React framework
- Solana for blockchain integration
- Supabase for database services

## Security Configuration

### Environment Variables

The application requires several environment variables to be set for proper security. These contain sensitive information and should never be committed to the repository.

1. Copy the `.env.example` file to `.env.local` for development:
   ```
   cp .env.example .env.local
   ```

2. Update the values in `.env.local` with your secure values:

   - **Supabase Configuration**:
     - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public anon key for client access
     - `SUPABASE_SERVICE_ROLE_KEY`: Service role key (only for admin operations)

   - **Solana Configuration**:
     - `NEXT_PUBLIC_SOLANA_RPC_URL`: RPC URL for Solana network
     - `NEXT_PUBLIC_TREASURY_WALLET`: Your presale treasury wallet address

   - **API Security**:
     - `API_SECRET_KEY`: Secret for API authentication
     - `JWT_SECRET`: Secret for JWT token signing

   - **Password Security**:
     - `ADMIN_PASSWORD_HASH`: Hash of admin password (see below)
     - `ADMIN_PASSWORD_SALT`: Salt used for admin password
     - `CORE_TIER_PASSWORD_HASH`: Hash for core tier access
     - `PASSWORD_SALT`: General salt for password hashing

### Generating Password Hashes

To generate secure password hashes for the admin and tiered access:

```javascript
const { createHash } = require('crypto');

// Replace with your secure password and salt
const password = 'your-secure-password';
const salt = 'your-secure-salt';

// Generate hash
const hash = createHash('sha256').update(password + salt).digest('hex');
console.log('Password Hash:', hash);
```

### Database Setup

Before running the application, update the `sql/schema.sql` file and replace the JWT secret placeholder:

```sql
ALTER DATABASE postgres SET "app.jwt_secret" TO '{{REPLACE_WITH_SECURE_JWT_SECRET}}';
```

### Production Deployment

For production deployment:

1. Set all environment variables on your hosting platform
2. Ensure no default or placeholder values are used
3. Regularly rotate secrets and passwords
4. Use strong, randomly generated values for all secrets 

## Token Contract Preparation

The application is prepared for token contract integration but doesn't currently include the token contract itself. 

### What's Already Implemented:

1. **API Endpoints**
   - POST `/api/contribute` - Record contributions with vesting periods
   - GET `/api/vesting/options` - Fetch available vesting options
   - POST `/api/vesting/status` - Check vesting status and claimable tokens
   - POST `/api/vesting/claim` - Claim tokens after vesting period

2. **Utility Functions**
   - Token transfer utilities in `utils/token-client.ts`
   - Balance checking and claiming functions
   - Admin transaction handling

3. **UI Components**
   - Token staking interface
   - Vesting period selection
   - Claiming interface

### Before Going Live with the Token Contract:

1. **Deploy the Token Contract**
   - Create and deploy the SPL token on Solana
   - Update the `.env.local` file with the token contract address

2. **Setup Admin Wallet**
   - Configure a secure admin wallet for token distribution
   - Store the admin private key securely (never commit to public repositories)

3. **Uncomment Token Functions**
   - Uncomment the token transfer functions in the claim API endpoint
   - Update the token decimals if different from the default (9)

4. **Test the Integration**
   - Test with a small amount on devnet first
   - Verify token transfers work correctly 

# Token Distribution Info

The application is configured for a 1 billion (1,000,000,000) POOKIE token total supply with the following settings:

## Token Supply

- **Total Supply**: 1,000,000,000 POOKIE tokens
- **Presale Allocation**: 5% of total supply (50,000,000 tokens)
- **Maximum SOL Cap**: 50 SOL
- **Token Rate**: 1,000,000 POOKIE tokens per SOL

These values are configurable in the `.env.local` file:

```
# Token supply settings
NEXT_PUBLIC_TOKEN_TOTAL_SUPPLY="1000000000" # 1 billion POOKIE total supply
NEXT_PUBLIC_PRESALE_ALLOCATION_PERCENTAGE="5" # 5% of total supply allocated to presale
NEXT_PUBLIC_MAX_SOL_CAP="50" # Maximum SOL to be raised
```

## Percentage-Based Calculations

All token calculations are percentage-based rather than using fixed amounts, making the system flexible for any token supply. Key utility functions for token calculations are located in `utils/token-supply.ts`.

## Vesting Bonuses

Vesting bonuses are applied as percentages to the base token allocation:

- **No lock-up**: 0% bonus
- **1-day lock-up**: 5% bonus
- **3-day lock-up**: 15% bonus
- **5-day lock-up**: 30% bonus
- **7-day lock-up**: 50% bonus

## Token Contract Integration

The system is prepared for token contract integration but requires the actual token contract address to be set in the `.env.local` file once deployed:

```
NEXT_PUBLIC_POOKIE_TOKEN_CONTRACT="your_token_contract_address"
```

## Latest Updates
- Updated NFT staking functionality
- Added direct NFT staking link on homepage
- Fixed deployment issues and updated documentation
- Verified Vercel/GitHub connection 