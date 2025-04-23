require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Solana connection
const solanaRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(solanaRpc);

// Treasury wallet address
const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET;

// List of recent transactions to import - REPLACE THESE with actual signatures from the last 4 hours
// You can get these from solscan.io or solana explorer
const recentTransactions = [
  // Example transaction signatures - REPLACE THESE with real ones
  '5KtPn1LGuxhFqTWK1Gsjxq4xqzwV8xNKE6V6rNhycfkxbGWYMvRWsLNJFYd2fGQJ2TPCoZvYaFARBKFY8MWZYX9H',
  '4rE5RXzvVg2X9KdD2CEVEHBwj2Mm4PVh1bSHdPgRccaeRUjGJwTkkyZ3qQyuAHQ7da3AmPSVMGPXK3DZfmoAXNBr',
  // Add more transaction signatures as needed
];

// Check if a transaction is already in the database to avoid duplicates
async function isTransactionRecorded(txSignature) {
  try {
    // Since we don't have a transaction_id field, we'll need to approximate this check
    // based on the existing data - for this example, we'll simply assume we should import all transactions
    return false;
  } catch (error) {
    console.error('Error checking if transaction is recorded:', error);
    return false;
  }
}

// Process a single transaction
async function processTransaction(txSignature) {
  try {
    console.log(`Processing transaction: ${txSignature}`);
    
    // Get transaction details from Solana
    const tx = await connection.getTransaction(txSignature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx) {
      console.error(`Transaction ${txSignature} not found`);
      return null;
    }
    
    // Check if the transaction was successful
    if (tx.meta?.err) {
      console.log(`Transaction ${txSignature} failed, skipping`);
      return null;
    }
    
    // Check if this transaction sent SOL to the treasury wallet
    const postBalances = tx.meta?.postBalances || [];
    const preBalances = tx.meta?.preBalances || [];
    const accountKeys = tx.transaction.message.accountKeys.map(key => key.toString());
    
    const treasuryIndex = accountKeys.findIndex(key => key === treasuryWallet);
    
    if (treasuryIndex === -1) {
      console.log(`Transaction ${txSignature} did not involve the treasury wallet, skipping`);
      return null;
    }
    
    // Calculate the balance change to the treasury wallet
    const preBalance = preBalances[treasuryIndex] || 0;
    const postBalance = postBalances[treasuryIndex] || 0;
    const balanceChange = (postBalance - preBalance) / LAMPORTS_PER_SOL;
    
    // Only process deposits to the treasury wallet
    if (balanceChange <= 0) {
      console.log(`Transaction ${txSignature} did not deposit SOL to the treasury wallet, skipping`);
      return null;
    }
    
    // Try to determine the sender's wallet address
    // In most cases, the first account is the fee payer and likely the sender
    let senderWallet = '';
    for (let i = 0; i < accountKeys.length; i++) {
      if (i !== treasuryIndex && preBalances[i] > postBalances[i]) {
        senderWallet = accountKeys[i];
        break;
      }
    }
    
    // If we couldn't determine the sender, use a placeholder
    if (!senderWallet) {
      senderWallet = 'unknown_sender';
    }
    
    console.log(`Found deposit to treasury: ${balanceChange} SOL from ${senderWallet}`);
    
    // Create contribution record
    const contributionData = {
      wallet_address: senderWallet,
      amount: balanceChange,
      // No transaction_id, tier, or status fields
    };
    
    // Insert into Supabase
    const { data, error } = await supabase
      .from('contributions')
      .insert(contributionData);
      
    if (error) {
      console.error(`Error inserting contribution for ${txSignature}:`, error);
      return null;
    }
    
    console.log(`Successfully recorded contribution of ${balanceChange} SOL from ${senderWallet}`);
    return contributionData;
  } catch (error) {
    console.error(`Error processing transaction ${txSignature}:`, error);
    return null;
  }
}

// Main function
async function main() {
  try {
    console.log('=== POOKIE Presale Transaction Import ===');
    console.log(`Treasury wallet: ${treasuryWallet}`);
    console.log(`Transactions to process: ${recentTransactions.length}`);
    
    let importedCount = 0;
    let failedCount = 0;
    
    // Process each transaction
    for (const txSignature of recentTransactions) {
      const alreadyRecorded = await isTransactionRecorded(txSignature);
      
      if (alreadyRecorded) {
        console.log(`Transaction ${txSignature} already recorded, skipping`);
        continue;
      }
      
      const result = await processTransaction(txSignature);
      if (result) {
        importedCount++;
      } else {
        failedCount++;
      }
    }
    
    console.log('\n=== Import Summary ===');
    console.log(`Transactions processed: ${recentTransactions.length}`);
    console.log(`Successfully imported: ${importedCount}`);
    console.log(`Failed or skipped: ${failedCount}`);
    
    // Get updated presale stats
    const { data: contributions, error } = await supabase
      .from('contributions')
      .select('amount, wallet_address');
      
    if (error) {
      console.error('Error fetching contributions:', error);
    } else {
      const total = contributions.reduce((sum, record) => sum + parseFloat(record.amount), 0);
      const contributors = new Set(contributions.map(c => c.wallet_address)).size;
      
      console.log('\n=== Updated Presale Statistics ===');
      console.log(`Total Raised: ${total.toFixed(4)} SOL`);
      console.log(`Contributors: ${contributors}`);
      console.log(`Progress: ${((total / 75) * 100).toFixed(2)}%`);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

main()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  }); 