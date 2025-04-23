require('dotenv').config({ path: '.env.local' });
const { Connection, PublicKey } = require('@solana/web3.js');
const fetch = require('node-fetch');

// Solana configuration
const solanaRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(solanaRpc);

// Treasury wallet address
const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET || '4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh';

// Funding goal
const solGoal = process.env.NEXT_PUBLIC_MAX_SOL_CAP || 75; // SOL

// ANSI color codes
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

// Function to create a progress bar
function createProgressBar(progress, length = 30) {
  const filledLength = Math.round(length * (progress / 100));
  const emptyLength = length - filledLength;
  
  let color = colors.green;
  if (progress > 80) color = colors.green;
  else if (progress > 50) color = colors.yellow;
  else color = colors.cyan;
  
  const filled = color + '█'.repeat(filledLength) + colors.reset;
  const empty = '░'.repeat(emptyLength);
  
  return `${filled}${empty} ${progress.toFixed(2)}%`;
}

async function getTransactions() {
  try {
    // Using Solscan API to get transactions
    const solscanUrl = `https://public-api.solscan.io/account/transactions?account=${treasuryWallet}&limit=20`;
    
    const response = await fetch(solscanUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('Error fetching transactions from Solscan:', await response.text());
      return [];
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
}

async function main() {
  try {
    console.log(`${colors.bright}${colors.yellow}=== POOKIE Treasury Balance Check ===\n${colors.reset}`);
    
    // Get the current treasury balance
    console.log(`${colors.cyan}Fetching treasury balance from Solana...${colors.reset}`);
    const treasuryPubkey = new PublicKey(treasuryWallet);
    const balance = await connection.getBalance(treasuryPubkey);
    const solBalance = balance / 1e9; // Convert lamports to SOL
    
    console.log(`${colors.bright}Treasury wallet: ${colors.yellow}${treasuryWallet}${colors.reset}`);
    console.log(`${colors.bright}Current balance: ${colors.green}${solBalance.toFixed(4)} SOL${colors.reset}`);
    
    // Calculate progress
    const progress = (solBalance / solGoal) * 100;
    console.log(`\n${colors.bright}${colors.white}Presale Progress:${colors.reset}`);
    console.log(createProgressBar(progress));
    console.log(`${solBalance.toFixed(4)} SOL of ${solGoal} SOL goal (${progress.toFixed(2)}%)\n`);
    
    // Fetch recent transactions
    console.log(`${colors.cyan}Fetching recent transactions from Solscan...${colors.reset}`);
    const transactions = await getTransactions();
    
    if (transactions && transactions.length > 0) {
      console.log(`\n${colors.bright}${colors.white}Recent Incoming Transactions:${colors.reset}`);
      
      let contributionsFound = 0;
      
      for (const tx of transactions) {
        // Check if this is an incoming transaction (SOL transfer to the treasury)
        if (tx.src !== treasuryWallet && tx.dst === treasuryWallet) {
          contributionsFound++;
          const amount = tx.lamport / 1e9; // Convert lamports to SOL
          const date = new Date(tx.blockTime * 1000).toLocaleString();
          const senderWallet = tx.src;
          const senderShort = `${senderWallet.substring(0, 6)}...${senderWallet.substring(senderWallet.length - 4)}`;
          
          console.log(`${colors.dim}${date}${colors.reset} | ${colors.yellow}${senderShort}${colors.reset} | ${colors.green}${amount.toFixed(4)} SOL${colors.reset} | ${tx.txHash.substring(0, 8)}...`);
        }
      }
      
      if (contributionsFound === 0) {
        console.log(`${colors.yellow}No contributions found in recent transactions.${colors.reset}`);
        console.log(`${colors.dim}Note: Initial funding or non-contribution transfers might be present.${colors.reset}`);
      }
    } else {
      console.log(`${colors.yellow}No recent transactions found for this wallet.${colors.reset}`);
    }
    
    console.log(`\n${colors.dim}This information reflects the actual on-chain data and may differ from the database.${colors.reset}`);
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  }); 