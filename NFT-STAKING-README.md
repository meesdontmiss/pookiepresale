# Pookie NFT Staking System

This document outlines the architecture, security considerations, and best practices for the Pookie NFT staking system.

## Architecture Overview

The Pookie NFT staking system consists of:

1. **Solana Program (Smart Contract)** - The on-chain program that handles staking, unstaking, and reward distribution.
2. **Client Library** - TypeScript library for interacting with the staking program.
3. **React UI Components** - User interface for staking operations.

## Security Considerations

### Smart Contract Security

- **Input Validation**: All user inputs are validated before processing transactions:
  - NFT ownership verification
  - NFT metadata validation
  - Proper account structure verification
  - Signature verification

- **Transaction Verification**: 
  - Double-check account permissions before execution
  - Verify program ownership of PDAs
  - Ensure transaction signer is the legitimate owner
  - Implement reentrancy protection

- **Account Management**:
  - Use PDA derivation to prevent address collisions
  - Implement proper account closing to prevent resource leaks
  - Check lamport balance sufficiency
  - Validate account initialization status

### Client-Side Security

- **Error Handling**: 
  - Use custom error types for detailed error reporting
  - Implement robust try/catch blocks around all transactions
  - Show user-friendly error messages
  - Log detailed errors for debugging

- **Transaction Retry Logic**:
  - Retry failed transactions with exponential backoff
  - Set maximum retry limit (default: 3)
  - Implement transaction timeout (default: 60 seconds)
  - Handle network congestion gracefully

- **Balance Verification**:
  - Check SOL balance before transaction to ensure fees can be paid
  - Warn users about low balance conditions
  - Prevent transaction attempts that will likely fail

- **User Experience**:
  - Display loading states during transactions
  - Provide clear success/failure notifications
  - Implement defensive UI to prevent double-submissions
  - Use ErrorBoundary for component failure recovery

## Development Best Practices

1. **Testing**:
   - Write comprehensive unit tests for program instructions
   - Test with different wallet configurations
   - Implement E2E tests for critical user flows
   - Test error conditions explicitly

2. **Transaction Monitoring**:
   - Log all transaction signatures
   - Implement transaction status tracking
   - Set up alerts for failed transactions
   - Use `confirmTransaction` with appropriate commitment level

3. **Performance Considerations**:
   - Batch related transactions when possible
   - Use versioned transactions for efficiency
   - Implement LRU caching for NFT data
   - Use computed PDAs efficiently

## Common Error Scenarios and Handling

| Error Type | Description | Handling Strategy |
|------------|-------------|-------------------|
| InsufficientBalanceError | User has insufficient SOL for transaction | Display warning, prevent transaction attempt |
| NftNotFoundError | NFT not found in user's wallet | Refresh NFT list, verify wallet connection |
| StakingAccountNotFoundError | Staking account not initialized | Create staking account first |
| TransactionTimeoutError | Transaction confirmation timeout | Implement retry with backoff |
| AlreadyStakedError | NFT is already staked | Update UI state, refresh staking data |
| NotStakedError | Attempt to unstake NFT that isn't staked | Update UI state, refresh staking data |
| WalletConnectionError | Wallet disconnected during transaction | Prompt reconnection, save pending action |

## Implementation Guidelines

### Program Instruction Parameters

Each instruction should validate:
1. Signer authorization
2. Account ownership
3. NFT metadata (if applicable)
4. Proper account initialization

### Client Implementation

The client library should:
1. Abstract program complexity
2. Handle common errors gracefully
3. Provide detailed error information
4. Implement retry logic
5. Verify transaction success

### UI Components

The React components should:
1. Show appropriate loading states
2. Handle errors gracefully
3. Provide clear user feedback
4. Implement ErrorBoundary for resilience
5. Refresh data at appropriate intervals

## Security Audit Checklist

Before deployment, ensure:

- [ ] All user inputs are validated
- [ ] Error handling is comprehensive
- [ ] Transaction timeouts are implemented
- [ ] Retry logic works correctly
- [ ] UI handles all error states
- [ ] Wallet disconnection is handled gracefully
- [ ] Balance checking is implemented
- [ ] PDA derivation is consistent
- [ ] Account cleanup works properly
- [ ] Transaction signing is secure

## Overview

The NFT staking feature allows users to stake their Pookie NFTs to earn POOKIE tokens as rewards. The system supports:

- Viewing and staking NFTs owned by a connected wallet
- Tracking staking duration and accumulating rewards
- Unstaking NFTs and claiming earned rewards

## Setup Instructions

### 1. Environment Variables

Add the following variables to your `.env.local` file:

```bash
# NFT Staking Configuration
NEXT_PUBLIC_POOKIE_COLLECTION_ADDRESS=ASky6aQmJxKn3cd1D7z6qoXnfV4EoWwe2RT1kM7BDWCQ
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

- `NEXT_PUBLIC_POOKIE_COLLECTION_ADDRESS`: The Solana address of your Pookie NFT collection
- `NEXT_PUBLIC_SOLANA_RPC_URL`: A Solana RPC endpoint (using the public one for testing)

### 2. Database Setup

There are two ways to set up the required database tables:

#### Option 1: Using the UI (Recommended for Development)

1. Start your development server
   ```bash
   npm run dev
   ```

2. Navigate to the NFT staking page
   - If the tables don't exist, you'll see a setup prompt
   - Click the "Initialize Staking" button to create the tables

#### Option 2: Using Command Line (Recommended for Production)

Run the staking initialization script:

```bash
npm run staking:init
```

This will create the necessary tables:
- `nft_staking_records`: Tracks staked NFTs
- `nft_staking_claims`: Records reward claims

#### Alternative: Using SQL Directly

You can also execute the SQL commands directly in Supabase:

1. Navigate to your Supabase dashboard
2. Open the SQL editor
3. Copy and paste the contents of `sql/staking_create_tables.sql`
4. Execute the SQL

### 3. Install Dependencies

```bash
npm install
```

## Usage

### For Users

1. Connect your Solana wallet (Phantom, Solflare, etc.)
2. View your NFTs in the Wallet tab
3. Stake NFTs by clicking the "Stake NFT" button
4. View staked NFTs and accumulated rewards in the Staked tab
5. Unstake and claim rewards by clicking "Unstake & Claim"

### For Developers

#### API Endpoints

- `POST /api/staking/stake`: Stake an NFT
  - Required params: `walletAddress`, `nftMint`, `stakingType: 'nft'`

- `POST /api/staking/unstake`: Unstake an NFT and claim rewards
  - Required params: `walletAddress`, `nftMint`, `stakingType: 'nft'`

- `GET /api/staking/nfts`: Get all staked NFTs for a wallet
  - Required query param: `wallet`

- `GET /api/nft/metadata`: Get metadata for a specific NFT
  - Required query param: `mint`

- `GET /api/staking/init`: Initialize the staking tables if they don't exist

#### Key Files

- `components/nft-staking.tsx`: Main component for NFT staking UI
- `utils/solana-nft.ts`: Utilities for Solana NFT operations
- `utils/check-staking-tables.ts`: Utilities for checking and creating database tables
- `app/api/staking/*`: API routes for staking operations
- `sql/staking_create_tables.sql`: SQL for creating database tables

## Reward Calculation

The current implementation awards 10 POOKIE tokens per day of staking. This value can be adjusted in:

- `app/api/staking/unstake/route.ts` (for claiming rewards)
- `app/api/staking/nfts/route.ts` (for displaying current rewards)

## Production Deployment

Before deploying to production:

1. Ensure all environment variables are properly set
2. Use a reliable Solana RPC endpoint with sufficient rate limits
3. Run `npm run staking:init` to ensure tables are created
4. Test the staking flow with real NFTs

## Troubleshooting

Common issues:

- **NFTs not appearing**: Check that you're using the correct collection address
- **Database errors**: Run the initialization script or check Supabase permissions
- **RPC rate limiting**: Use a dedicated Solana RPC endpoint for production
- **Slow NFT loading**: This implementation uses standard RPC calls, which may be slower than specialized APIs 