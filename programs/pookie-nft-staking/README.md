# Pookie NFT Staking Program

A Solana program for staking Pookie NFTs to earn POOKIE tokens as rewards.

## Features

- Secure on-chain staking of NFTs
- Automatic reward calculation based on staking duration
- Claim rewards without unstaking
- Treasury distribution with controlled daily emission

## Reward Rate

Currently configured to distribute 250 POOKIE tokens per NFT per day.

## Commands

From the project root:

```bash
# Build the program
npm run staking:build

# Deploy the program
npm run staking:deploy
```

## Program Overview

### Instructions

1. **StakeNft** - Stake an NFT by sending it to the program's custody
2. **UnstakeNft** - Unstake an NFT and return it to the owner
3. **ClaimRewards** - Claim accumulated rewards while keeping the NFT staked

### Architecture

The program uses Program Derived Addresses (PDAs) to:

1. Create stake accounts that track staking data
2. Hold NFTs in program custody during staking
3. Control reward distribution from the treasury

### Security Measures

- Owner verification on all transactions
- Secure NFT escrow using PDAs
- Proper signature verification

## Deployment

After deployment, you'll need to update the following environment variables:

```
NEXT_PUBLIC_STAKING_PROGRAM_ID=<your-deployed-program-id>
NEXT_PUBLIC_POOKIE_TOKEN_MINT=<your-token-mint-address>
NEXT_PUBLIC_TREASURY_ADDRESS=<your-treasury-address>
```

## Treasury Setup

The treasury wallet that holds POOKIE tokens for distribution should be set up as a token account owned by the program authority PDA. This ensures that only the program can distribute rewards.

## Testing

Before deploying to mainnet, thoroughly test on devnet with the following steps:

1. Create a test POOKIE token on devnet
2. Create test NFTs from the collection
3. Fund the treasury with test tokens
4. Test staking, unstaking, and claiming with different accounts 