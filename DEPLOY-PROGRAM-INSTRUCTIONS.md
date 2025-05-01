# Deploying the Pookie NFT Staking Program to Mainnet

## Issue Description

The Pookie NFT Staking program needs to be deployed to the Solana mainnet. Currently, the application is trying to use the program at address `FWcUFBDFW6Y677jcSb6cgjpYQ9dYpnNCfBWkDChHEGuq`, but this program does not exist on mainnet, causing staking transactions to fail.

## Deployment Instructions

### Prerequisites
- Solana CLI installed and configured for mainnet
- A wallet with sufficient SOL to pay for deployment (approximately 5 SOL)
- Access to the program keypair file

### Steps to Deploy

1. **Prepare the Environment**

   ```bash
   # Clone the repository (if not already done)
   git clone https://github.com/meesdontmiss/pookiepresale.git
   cd pookiepresale
   
   # Make sure you're on the main branch
   git checkout master
   ```

2. **Build the Program**

   ```bash
   # Navigate to the program directory
   cd programs/pookie-nft-staking
   
   # Build the program
   cargo build-bpf
   ```

3. **Deploy to Mainnet**

   ```bash
   # Return to the main directory
   cd ../..
   
   # Make sure you have the program keypair
   # This keypair file should produce the program ID: FWcUFBDFW6Y677jcSb6cgjpYQ9dYpnNCfBWkDChHEGuq
   
   # Deploy the program to mainnet
   solana program deploy \
     --program-id pookie-nft-staking-keypair.json \
     target/deploy/pookie_nft_staking.so
   ```

4. **Verify Deployment**

   ```bash
   # Verify the program exists on mainnet
   solana program show FWcUFBDFW6Y677jcSb6cgjpYQ9dYpnNCfBWkDChHEGuq
   ```

5. **Update Environment Variables**

   In your production environment (Vercel), set:
   ```
   NEXT_PUBLIC_STAKING_PROGRAM_ID=FWcUFBDFW6Y677jcSb6cgjpYQ9dYpnNCfBWkDChHEGuq
   ```

## Alternative: Use Devnet Program Temporarily

If the mainnet deployment can't be completed immediately, we can temporarily use the devnet version of the program by modifying the connection endpoint to point to devnet instead of mainnet.

1. In `.env.local` or Vercel environment variables:
   ```
   NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
   ```

2. Update the connection initialization to use devnet:
   ```typescript
   // In app/providers.tsx or similar
   const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
   ```

This is a temporary solution only, as it will cause all other Solana interactions to use devnet instead of mainnet.

## Additional Notes

- The program ID is deterministic based on the keypair, so deploying with the same keypair should result in the same program ID.
- Make sure to test staking functionality after deployment.
- Ensure environment variables are updated in all necessary environments (development, staging, production). 