require('dotenv').config({ path: '.env.local' });
const fetch = require('node-fetch');
const { Connection, PublicKey } = require('@solana/web3.js');

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Solana configuration
const solanaRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(solanaRpc);

// Treasury wallet address
const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET || '4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh';

// Solana Explorer API endpoints
const solanaExplorerAPI = 'https://public-api.solscan.io';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

// Sleep function to handle rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch transactions from Solana for the treasury wallet
 */
async function fetchWalletTransactions() {
  try {
    console.log(`${colors.cyan}Fetching transactions for wallet ${treasuryWallet}...${colors.reset}`);
    
    // First try Solscan API
    const solscanUrl = `${solanaExplorerAPI}/account/transactions?account=${treasuryWallet}&limit=50`;
    const response = await fetch(solscanUrl, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        console.log(`${colors.green}Successfully fetched ${data.length} transactions from Solscan${colors.reset}`);
        return data;
      }
    }
    
    console.log(`${colors.yellow}Couldn't fetch transactions from Solscan API, trying direct RPC...${colors.reset}`);
    
    // Fallback to direct RPC method if Solscan fails
    const signatures = await connection.getSignaturesForAddress(
      new PublicKey(treasuryWallet),
      { limit: 50 }
    );
    
    console.log(`${colors.cyan}Found ${signatures.length} signatures, fetching transaction details...${colors.reset}`);
    
    const transactions = [];
    
    for (const sigInfo of signatures) {
      try {
        const tx = await connection.getTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0
        });
        
        if (tx) {
          // Find SOL transfers to the treasury wallet
          const preBalance = tx.meta.preBalances;
          const postBalance = tx.meta.postBalances;
          
          // Find the treasury wallet account index
          const accountKeys = tx.transaction.message.accountKeys;
          const treasuryIndex = accountKeys.findIndex(key => 
            key.toBase58() === treasuryWallet
          );
          
          if (treasuryIndex >= 0) {
            const balanceChange = postBalance[treasuryIndex] - preBalance[treasuryIndex];
            
            // If the treasury balance increased, this is a contribution
            if (balanceChange > 0) {
              // Find the sender (the account whose balance decreased)
              let senderIndex = -1;
              for (let i = 0; i < accountKeys.length; i++) {
                if (i !== treasuryIndex && preBalance[i] > postBalance[i]) {
                  senderIndex = i;
                  break;
                }
              }
              
              const senderWallet = senderIndex >= 0 
                ? accountKeys[senderIndex].toBase58() 
                : 'unknown';
              
              transactions.push({
                txHash: sigInfo.signature,
                blockTime: tx.blockTime,
                src: senderWallet,
                dst: treasuryWallet,
                lamport: balanceChange
              });
            }
          }
        }
        
        // Avoid rate limits
        await sleep(100);
      } catch (err) {
        console.error(`${colors.red}Error processing transaction ${sigInfo.signature}:${colors.reset}`, err.message);
      }
    }
    
    console.log(`${colors.green}Successfully processed ${transactions.length} transactions${colors.reset}`);
    return transactions;
  } catch (error) {
    console.error(`${colors.red}Error fetching transactions:${colors.reset}`, error.message);
    return [];
  }
}

/**
 * Clear existing contributions and import new ones
 */
async function resetAndImportContributions(transactions) {
  try {
    // Step 1: Get all existing contribution IDs
    console.log(`\n${colors.cyan}Fetching existing contributions...${colors.reset}`);
    const getResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?select=id,transaction_signature`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    if (!getResponse.ok) {
      console.error(`${colors.red}Error fetching contributions:${colors.reset}`, await getResponse.text());
      return;
    }
    
    const existingContributions = await getResponse.json();
    console.log(`${colors.cyan}Found ${existingContributions.length} existing contribution(s)${colors.reset}`);
    
    // Create a set of existing transaction signatures
    const existingTxSigs = new Set(
      existingContributions
        .filter(c => c.transaction_signature)
        .map(c => c.transaction_signature)
    );
    
    // Step 2: Delete existing contributions
    if (existingContributions.length > 0) {
      console.log(`\n${colors.yellow}Removing existing contributions...${colors.reset}`);
      
      for (const contribution of existingContributions) {
        const deleteResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?id=eq.${contribution.id}`, {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=minimal'
          }
        });
        
        if (!deleteResponse.ok) {
          console.error(`${colors.red}Error deleting contribution ${contribution.id}:${colors.reset}`, await deleteResponse.text());
        } else {
          console.log(`${colors.dim}Deleted contribution ID: ${contribution.id}${colors.reset}`);
        }
      }
    }
    
    // Step 3: Import transactions as contributions
    if (transactions.length > 0) {
      console.log(`\n${colors.cyan}Importing ${transactions.length} transactions as contributions...${colors.reset}`);
      
      let successCount = 0;
      let totalAmount = 0;
      
      for (const tx of transactions) {
        // Skip non-contribution transactions (where the treasury is not the destination)
        if (tx.dst !== treasuryWallet) continue;
        
        // Calculate SOL amount
        const solAmount = tx.lamport / 1e9;
        
        // Skip dust amounts (less than 0.001 SOL)
        if (solAmount < 0.001) continue;
        
        // Skip transactions already in the database
        if (existingTxSigs.has(tx.txHash)) {
          console.log(`${colors.yellow}Skipping already imported transaction: ${tx.txHash}${colors.reset}`);
          continue;
        }
        
        const date = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : new Date().toISOString();
        
        // Import the contribution
        const insertResponse = await fetch(`${supabaseUrl}/rest/v1/contributions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            wallet_address: tx.src,
            amount: solAmount,
            transaction_signature: tx.txHash,
            timestamp: date,
            is_verified: true
          })
        });
        
        if (insertResponse.ok) {
          console.log(`${colors.green}Imported contribution: ${solAmount.toFixed(4)} SOL from ${tx.src.substring(0, 8)}...${colors.reset}`);
          successCount++;
          totalAmount += solAmount;
        } else {
          console.error(`${colors.red}Error importing contribution:${colors.reset}`, await insertResponse.text());
        }
        
        // Avoid rate limits
        await sleep(100);
      }
      
      console.log(`\n${colors.green}Import summary:${colors.reset}`);
      console.log(`${colors.green}Successfully imported ${successCount} contributions${colors.reset}`);
      console.log(`${colors.green}Total imported amount: ${totalAmount.toFixed(4)} SOL${colors.reset}`);
    } else {
      console.log(`\n${colors.yellow}No transactions to import${colors.reset}`);
    }
    
    // Step 4: Verify the database state
    console.log(`\n${colors.cyan}Verifying database state...${colors.reset}`);
    const statsResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?select=count(*),sum(amount)`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    if (statsResponse.ok) {
      const stats = await statsResponse.json();
      if (stats && stats.length > 0) {
        console.log(`${colors.bright}${colors.white}Database now shows:${colors.reset}`);
        console.log(`${colors.bright}${colors.white}- Contributions: ${stats[0].count}${colors.reset}`);
        console.log(`${colors.bright}${colors.white}- Total amount: ${stats[0].sum || 0} SOL${colors.reset}`);
      }
    } else {
      console.error(`${colors.red}Error verifying database state:${colors.reset}`, await statsResponse.text());
    }
    
    // Step 5: Verify the actual balance matches
    console.log(`\n${colors.cyan}Verifying Solana blockchain balance...${colors.reset}`);
    const treasuryPubkey = new PublicKey(treasuryWallet);
    const balance = await connection.getBalance(treasuryPubkey);
    const solBalance = balance / 1e9; // Convert lamports to SOL
    
    console.log(`${colors.bright}${colors.white}Current treasury balance on Solana: ${solBalance.toFixed(4)} SOL${colors.reset}`);
    
  } catch (error) {
    console.error(`${colors.red}Unexpected error:${colors.reset}`, error.message);
  }
}

async function main() {
  console.log(`${colors.bright}${colors.yellow}=== POOKIE Contribution Importer ===\n${colors.reset}`);
  
  // Fetch all transactions for the treasury wallet
  const transactions = await fetchWalletTransactions();
  
  // Reset database and import contributions
  await resetAndImportContributions(transactions);
  
  console.log(`\n${colors.bright}${colors.green}Done! Contribution import complete.${colors.reset}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(`${colors.red}Fatal error:${colors.reset}`, err);
    process.exit(1);
  }); 