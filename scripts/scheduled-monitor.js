require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');
const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');
const schedule = require('node-schedule');

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Solana configuration 
const solanaRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
const connection = new Connection(solanaRpc, 'confirmed');

// Treasury wallet address
const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET || '4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh';
const treasuryPubkey = new PublicKey(treasuryWallet);

// Configuration
const BATCH_SIZE = 5; // Process 5 transactions at a time to avoid rate limits
const MIN_SOL_AMOUNT = 0.001; // Minimum amount to consider a valid contribution
const SLEEP_BETWEEN_REQUESTS = 10000; // 10 seconds between API requests to avoid rate limits
const SLEEP_BETWEEN_BATCHES = 30000; // 30 seconds between batches
const CHECK_INTERVAL = '0 * * * *'; // Run every hour at minute 0

// ANSI color codes for pretty console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Sleep function to avoid rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to get transaction signatures for the treasury wallet
async function getRecentTransactionSignatures(limit = 10) {
  try {
    console.log(`${colors.cyan}Fetching recent transaction signatures (limit: ${limit})...${colors.reset}`);
    
    // Get signatures of recent transactions
    const signatures = await connection.getSignaturesForAddress(
      treasuryPubkey,
      { limit }
    );
    
    console.log(`${colors.green}Found ${signatures.length} transaction signatures${colors.reset}`);
    return signatures;
  } catch (error) {
    console.error(`${colors.red}Error fetching transaction signatures:${colors.reset}`, error.message);
    return [];
  }
}

// Function to get processed transaction signatures from database
async function getProcessedSignatures() {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/contributions?select=transaction_signature`,
      {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(await response.text());
    }
    
    const data = await response.json();
    return new Set(data.map(item => item.transaction_signature).filter(Boolean));
  } catch (error) {
    console.error(`${colors.red}Error getting processed signatures:${colors.reset}`, error.message);
    return new Set();
  }
}

// Get transaction details with retry logic for rate limits
async function getTransactionDetails(signature, maxRetries = 7) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });
      return tx;
    } catch (error) {
      if (error.message.includes('429') || error.message.includes('Too many requests')) {
        retries++;
        const delay = Math.pow(2, retries) * 1000; // Exponential backoff
        console.log(`${colors.yellow}Rate limited, retrying in ${delay/1000}s (${retries}/${maxRetries})${colors.reset}`);
        await sleep(delay);
      } else {
        console.error(`${colors.red}Error getting transaction:${colors.reset}`, error.message);
        throw error;
      }
    }
  }
  console.log(`${colors.red}Failed to get transaction details after ${maxRetries} retries${colors.reset}`);
  return null;
}

// Function to check if a transaction is a contribution to the treasury
async function processTransaction(signature, processedSignatures) {
  try {
    console.log(`${colors.cyan}Processing transaction ${signature.substring(0, 8)}...${colors.reset}`);
    
    // Check if already processed
    if (processedSignatures.has(signature)) {
      console.log(`${colors.yellow}Transaction ${signature.substring(0, 8)}... already exists in database, skipping${colors.reset}`);
      return null;
    }
    
    // Get transaction details - with increased delay for rate limits
    await sleep(SLEEP_BETWEEN_REQUESTS / 2); // Additional delay before fetching
    const tx = await getTransactionDetails(signature);
    if (!tx) {
      console.log(`${colors.yellow}Could not get details for transaction ${signature.substring(0, 8)}...${colors.reset}`);
      return null;
    }
    
    // Find the treasury wallet index in the transaction accounts
    const accountKeys = tx.transaction.message.accountKeys;
    const treasuryIndex = accountKeys.findIndex(key => 
      key.toBase58() === treasuryWallet
    );
    
    if (treasuryIndex === -1) {
      console.log(`${colors.yellow}Treasury wallet not found in transaction accounts${colors.reset}`);
      return null;
    }
    
    // Check if treasury wallet balance increased (i.e., it received SOL)
    const preBalance = tx.meta.preBalances[treasuryIndex];
    const postBalance = tx.meta.postBalances[treasuryIndex];
    const balanceChange = postBalance - preBalance;
    
    // Convert from lamports to SOL
    const solBalanceChange = balanceChange / 1e9;
    
    // Get current total balance
    const currentBalance = await connection.getBalance(treasuryPubkey) / 1e9;
    
    // Skip if this transaction matches or nearly matches the entire wallet balance
    // This prevents treating wallet initialization or balance transfers as contributions
    if (Math.abs(solBalanceChange - currentBalance) < 0.1) {
      console.log(`${colors.yellow}Skipping transaction that appears to be wallet initialization or full balance transfer: ${solBalanceChange.toFixed(6)} SOL${colors.reset}`);
      return null;
    }
    
    // Only process if the treasury received SOL and it's above our minimum threshold
    if (balanceChange <= 0 || solBalanceChange < MIN_SOL_AMOUNT) {
      console.log(`${colors.yellow}Not a contribution or below threshold: ${solBalanceChange.toFixed(6)} SOL${colors.reset}`);
      return null;
    }
    
    // Find the sender - account whose balance decreased
    let senderWallet = 'unknown';
    let senderIndex = -1;
    
    for (let i = 0; i < accountKeys.length; i++) {
      if (i !== treasuryIndex && tx.meta.preBalances[i] > tx.meta.postBalances[i]) {
        senderIndex = i;
        senderWallet = accountKeys[i].toBase58();
        break;
      }
    }
    
    // Get transaction timestamp
    const blockTime = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : new Date().toISOString();
    
    console.log(`${colors.green}Found contribution: ${solBalanceChange.toFixed(4)} SOL from ${senderWallet.substring(0, 8)}...${colors.reset}`);
    
    // Return the contribution details
    return {
      signature,
      sender: senderWallet,
      amount: solBalanceChange,
      timestamp: blockTime
    };
  } catch (error) {
    console.error(`${colors.red}Error processing transaction ${signature}:${colors.reset}`, error.message);
    return null;
  }
}

// Function to insert a contribution into the database
async function insertContribution(contribution) {
  try {
    console.log(`${colors.cyan}Inserting contribution to database...${colors.reset}`);
    
    const insertResponse = await fetch(`${supabaseUrl}/rest/v1/contributions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        wallet_address: contribution.sender,
        amount: contribution.amount,
        transaction_signature: contribution.signature,
        timestamp: contribution.timestamp,
        is_verified: true
      })
    });
    
    if (!insertResponse.ok) {
      console.error(`${colors.red}Error inserting contribution:${colors.reset}`, await insertResponse.text());
      return false;
    }
    
    console.log(`${colors.green}Successfully inserted contribution: ${contribution.amount.toFixed(4)} SOL from ${contribution.sender.substring(0, 8)}...${colors.reset}`);
    return true;
  } catch (error) {
    console.error(`${colors.red}Error inserting contribution:${colors.reset}`, error.message);
    return false;
  }
}

// Process a batch of transaction signatures
async function processBatch(signatures, processedSignatures, batchNumber, totalBatches) {
  console.log(`\n${colors.bright}${colors.magenta}Processing batch ${batchNumber} of ${totalBatches}...${colors.reset}`);
  
  let successCount = 0;
  let totalAmount = 0;
  
  for (const sigInfo of signatures) {
    const contribution = await processTransaction(sigInfo.signature, processedSignatures);
    
    if (contribution) {
      // Insert the contribution into the database
      const success = await insertContribution(contribution);
      
      if (success) {
        successCount++;
        totalAmount += contribution.amount;
      }
    }
    
    // Sleep between requests to avoid rate limits
    await sleep(SLEEP_BETWEEN_REQUESTS);
  }
  
  console.log(`\n${colors.bright}${colors.green}Batch ${batchNumber} Summary:${colors.reset}`);
  console.log(`${colors.green}Successfully imported ${successCount} contributions${colors.reset}`);
  console.log(`${colors.green}Total imported amount in this batch: ${totalAmount.toFixed(4)} SOL${colors.reset}`);
  
  // Sleep between batches to avoid rate limits
  if (batchNumber < totalBatches) {
    console.log(`${colors.yellow}Sleeping for ${SLEEP_BETWEEN_BATCHES/1000} seconds before next batch...${colors.reset}`);
    await sleep(SLEEP_BETWEEN_BATCHES);
  }
  
  return { successCount, totalAmount };
}

// Monitor function to check for new transactions and update database
async function monitorTransactions() {
  try {
    const now = new Date();
    console.log(`${colors.bright}${colors.magenta}=== POOKIE Transaction Monitor [${now.toLocaleString()}] ===\n${colors.reset}`);
    
    // Get processed transaction signatures
    const processedSignatures = await getProcessedSignatures();
    console.log(`${colors.cyan}Found ${processedSignatures.size} already processed transactions${colors.reset}`);
    
    // Get database totals first
    console.log(`${colors.cyan}Getting recorded contribution total...${colors.reset}`);
    let recordedTotal = 0;
    
    const sumResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?select=amount`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    if (sumResponse.ok) {
      const amounts = await sumResponse.json();
      recordedTotal = amounts.reduce((sum, item) => sum + parseFloat(item.amount), 0);
      console.log(`${colors.green}Recorded contributions total: ${recordedTotal.toFixed(4)} SOL${colors.reset}`);
    } else {
      console.error(`${colors.red}Error getting recorded totals:${colors.reset}`, await sumResponse.text());
    }
    
    // Get current treasury balance
    console.log(`${colors.cyan}Checking current treasury balance...${colors.reset}`);
    const balance = await connection.getBalance(treasuryPubkey);
    const solBalance = balance / 1e9; // Convert lamports to SOL
    
    console.log(`${colors.bright}Treasury wallet: ${colors.yellow}${treasuryWallet}${colors.reset}`);
    console.log(`${colors.bright}Actual wallet balance: ${colors.green}${solBalance.toFixed(4)} SOL${colors.reset}`);
    console.log(`${colors.bright}Official contribution total: ${colors.green}${recordedTotal.toFixed(4)} SOL${colors.reset}`);
    
    // Get recent transactions
    const signatures = await getRecentTransactionSignatures(10);
    
    if (signatures.length === 0) {
      console.log(`${colors.yellow}No recent transactions found${colors.reset}`);
      return;
    }
    
    // Filter out already processed transactions
    const newSignatures = signatures.filter(sig => !processedSignatures.has(sig.signature));
    console.log(`${colors.cyan}Found ${newSignatures.length} new transactions to process${colors.reset}`);
    
    if (newSignatures.length === 0) {
      console.log(`${colors.green}No new transactions to process, all caught up!${colors.reset}`);
      return;
    }
    
    // Process transactions in batches to avoid rate limits
    const batches = [];
    for (let i = 0; i < newSignatures.length; i += BATCH_SIZE) {
      batches.push(newSignatures.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`${colors.cyan}Will process ${newSignatures.length} transactions in ${batches.length} batches of ${BATCH_SIZE}${colors.reset}`);
    
    // Process each batch sequentially
    let totalSuccessCount = 0;
    let totalImportedAmount = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const { successCount, totalAmount } = await processBatch(batches[i], processedSignatures, i + 1, batches.length);
      totalSuccessCount += successCount;
      totalImportedAmount += totalAmount;
    }
    
    // Summarize results
    console.log(`\n${colors.bright}${colors.green}Overall Import Summary:${colors.reset}`);
    console.log(`${colors.green}Successfully imported ${totalSuccessCount} new contributions${colors.reset}`);
    console.log(`${colors.green}Total imported amount: ${totalImportedAmount.toFixed(4)} SOL${colors.reset}`);
    
    // Check database state
    console.log(`\n${colors.cyan}Checking database state...${colors.reset}`);
    const statsResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?select=count`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    if (statsResponse.ok) {
      const countData = await statsResponse.json();
      const totalCount = countData[0]?.count || 0;
      
      // Get updated sum of contributions
      const updatedSumResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?select=amount`, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`
        }
      });
      
      if (updatedSumResponse.ok) {
        const amounts = await updatedSumResponse.json();
        const totalSum = amounts.reduce((sum, item) => sum + parseFloat(item.amount), 0);
        
        console.log(`${colors.bright}${colors.white}Database contains:${colors.reset}`);
        console.log(`${colors.bright}${colors.white}- ${totalCount} contributions${colors.reset}`);
        console.log(`${colors.bright}${colors.white}- ${totalSum.toFixed(4)} SOL total${colors.reset}`);
        
        // Display the official contribution total, not the actual wallet balance
        console.log(`${colors.bright}${colors.white}Official contribution total for display: ${colors.green}${totalSum.toFixed(2)} SOL${colors.reset}`);
        
        // Compare with actual balance just for monitoring
        const diff = Math.abs(solBalance - totalSum);
        if (diff > 0.001) {
          console.log(`${colors.yellow}Note: There's a difference of ${diff.toFixed(4)} SOL between the database total and the actual balance${colors.reset}`);
          console.log(`${colors.yellow}This is normal and expected. The database total is the official donation amount.${colors.reset}`);
        } else {
          console.log(`${colors.green}Database total matches the actual balance!${colors.reset}`);
        }
      }
    } else {
      console.error(`${colors.red}Error checking database state:${colors.reset}`, await statsResponse.text());
    }
    
    console.log(`\n${colors.bright}${colors.green}Transaction monitoring complete.${colors.reset}`);
    console.log(`${colors.dim}Next check scheduled for ${new Date(Date.now() + 3600000).toLocaleString()}${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.red}Unexpected error in monitor:${colors.reset}`, error.message);
  }
}

// Schedule the monitoring job
console.log(`${colors.bright}${colors.magenta}=== Starting POOKIE Presale Monitoring Service ===\n${colors.reset}`);
console.log(`${colors.cyan}Will check for new contributions every hour${colors.reset}`);

// Run once immediately
monitorTransactions().catch(err => {
  console.error(`${colors.red}Error in initial monitoring run:${colors.reset}`, err);
});

// Schedule to run periodically
const job = schedule.scheduleJob(CHECK_INTERVAL, async () => {
  try {
    await monitorTransactions();
  } catch (error) {
    console.error(`${colors.red}Error in scheduled monitoring:${colors.reset}`, error);
  }
});

console.log(`${colors.green}Monitoring service started! Press Ctrl+C to stop.${colors.reset}`);

// Handle process termination
process.on('SIGINT', () => {
  console.log(`${colors.yellow}Stopping monitoring service...${colors.reset}`);
  job.cancel();
  console.log(`${colors.green}Monitoring service stopped.${colors.reset}`);
  process.exit(0);
}); 