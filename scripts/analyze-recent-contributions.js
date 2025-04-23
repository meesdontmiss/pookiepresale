const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config({ path: '.env.local' });

const TREASURY_WALLET = '4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh';
// Using default free public Solana mainnet RPC endpoint
const RPC_ENDPOINT = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// Contribution parameters
const VALID_AMOUNTS = {
  public: 0.25,
  private: {
    min: 0.5,
    max: 2.0
  }
};

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getRecentTransactions() {
  try {
    const connection = new Connection(RPC_ENDPOINT, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000
    });
    const pubkey = new PublicKey(TREASURY_WALLET);

    // Get just a few recent signatures to start
    console.log('Fetching recent signatures...');
    await sleep(1000); // Small initial delay
    
    const signatures = await connection.getSignaturesForAddress(
      pubkey,
      { limit: 15 }, // Moderate batch size
      'confirmed'
    );

    console.log(`Found ${signatures.length} recent transactions to analyze`);
    console.log('Processing transactions...\n');

    const validContributions = {
      public: [],
      private: []
    };

    // Process transactions with moderate delays
    for (let i = 0; i < signatures.length; i++) {
      const sigInfo = signatures[i];
      
      try {
        console.log(`Processing transaction ${i + 1}/${signatures.length}`);
        
        // Moderate delay between transactions
        await sleep(2000);
        
        const tx = await connection.getTransaction(sigInfo.signature);
        if (!tx || !tx.meta) {
          console.log('No transaction data found, skipping...\n');
          continue;
        }

        // Look for SOL transfers to our treasury
        const preBalance = tx.meta.preBalances[0];
        const postBalance = tx.meta.postBalances[0];
        const amount = (postBalance - preBalance) / 1e9; // Convert lamports to SOL

        if (amount <= 0) {
          console.log('Not an incoming transaction, skipping...\n');
          continue;
        }

        // Check if amount matches our contribution parameters
        if (amount === VALID_AMOUNTS.public) {
          const contribution = {
            signature: sigInfo.signature,
            amount,
            timestamp: sigInfo.blockTime ? new Date(sigInfo.blockTime * 1000) : null,
            sender: tx.transaction.message.accountKeys[0].toString()
          };
          validContributions.public.push(contribution);
          console.log(`Found public contribution: ${amount} SOL from ${contribution.sender}\n`);
        } else if (amount >= VALID_AMOUNTS.private.min && amount <= VALID_AMOUNTS.private.max) {
          const contribution = {
            signature: sigInfo.signature,
            amount,
            timestamp: sigInfo.blockTime ? new Date(sigInfo.blockTime * 1000) : null,
            sender: tx.transaction.message.accountKeys[0].toString()
          };
          validContributions.private.push(contribution);
          console.log(`Found private contribution: ${amount} SOL from ${contribution.sender}\n`);
        } else {
          console.log(`Transaction amount ${amount} SOL doesn't match contribution parameters\n`);
        }

      } catch (err) {
        if (err.message.includes('429')) {
          console.log('Rate limited, waiting 10 seconds before retrying...\n');
          await sleep(10000);
          i--; // Retry this transaction
          continue;
        }
        console.error(`Error processing transaction: ${err.message}\n`);
      }
    }

    // Print summary
    console.log('\n=== Valid Contributions Summary ===');
    console.log('Public Sale Contributions:', validContributions.public.length);
    console.log('Private Sale Contributions:', validContributions.private.length);

    if (validContributions.public.length > 0) {
      console.log('\nPublic Sale Contributions:');
      validContributions.public.forEach(c => {
        console.log(`- ${c.amount} SOL from ${c.sender}`);
        console.log(`  Time: ${c.timestamp}`);
        console.log(`  TX: ${c.signature}\n`);
      });
    }

    if (validContributions.private.length > 0) {
      console.log('\nPrivate Sale Contributions:');
      validContributions.private.forEach(c => {
        console.log(`- ${c.amount} SOL from ${c.sender}`);
        console.log(`  Time: ${c.timestamp}`);
        console.log(`  TX: ${c.signature}\n`);
      });
    }

    // Calculate totals
    const publicTotal = validContributions.public.reduce((sum, c) => sum + c.amount, 0);
    const privateTotal = validContributions.private.reduce((sum, c) => sum + c.amount, 0);

    console.log('\n=== Totals ===');
    console.log(`Public Sale Total: ${publicTotal.toFixed(4)} SOL`);
    console.log(`Private Sale Total: ${privateTotal.toFixed(4)} SOL`);
    console.log(`Combined Total: ${(publicTotal + privateTotal).toFixed(4)} SOL`);

  } catch (error) {
    console.error('Error:', error);
  }
}

getRecentTransactions().catch(console.error); 