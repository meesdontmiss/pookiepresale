#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { Connection, PublicKey } = require('@solana/web3.js');
const fetch = require('node-fetch');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Solana connection
const solanaRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(solanaRpc);

// Treasury wallet address
const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET;

// ANSI color codes for terminal output
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
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
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

// Function to format SOL values
function formatSOL(value) {
  return `${parseFloat(value).toFixed(4)} SOL`;
}

async function main() {
  try {
    console.clear(); // Clear the console for a clean output
    
    // Get presale stats
    const statsResponse = await fetch(`${supabaseUrl}/rest/v1/presale_stats?limit=1`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    if (!statsResponse.ok) {
      console.error('Error fetching presale stats:', await statsResponse.text());
      return;
    }
    
    const stats = await statsResponse.json();
    if (!stats || stats.length === 0) {
      console.error('No presale stats available');
      return;
    }
    
    const presaleStats = stats[0];
    const totalRaised = parseFloat(presaleStats.total_raised);
    const cap = parseFloat(presaleStats.cap);
    const progress = (totalRaised / cap) * 100;
    
    // Get recent contributions
    const contributionsResponse = await fetch(`${supabaseUrl}/rest/v1/contributions?select=*&order=id.desc&limit=5`, {
      method: 'GET',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    
    const contributions = contributionsResponse.ok 
      ? await contributionsResponse.json() 
      : [];
    
    // Display the ASCII Art Dashboard
    console.log('\n');
    console.log(`${colors.bright}${colors.magenta}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.magenta}║                     ${colors.yellow}POOKIE PRESALE DASHBOARD${colors.magenta}                ║${colors.reset}`);
    console.log(`${colors.bright}${colors.magenta}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log('\n');
    
    // Display presale progress
    console.log(`${colors.bright}${colors.white}  Presale Progress:${colors.reset}`);
    console.log(`  ${createProgressBar(progress)}`);
    console.log('\n');
    
    // Display key metrics
    console.log(`${colors.bright}${colors.white}  Key Metrics:${colors.reset}`);
    console.log(`  • ${colors.cyan}Total Raised:${colors.reset}    ${formatSOL(totalRaised)}`);
    console.log(`  • ${colors.cyan}Goal:${colors.reset}            ${formatSOL(cap)}`);
    console.log(`  • ${colors.cyan}Contributors:${colors.reset}    ${presaleStats.contributors}`);
    console.log('\n');
    
    // Display recent contributions if available
    if (contributions.length > 0) {
      console.log(`${colors.bright}${colors.white}  Recent Contributions:${colors.reset}`);
      contributions.forEach((contribution, index) => {
        const walletPreview = contribution.wallet_address 
          ? `${contribution.wallet_address.substring(0, 6)}...${contribution.wallet_address.substring(contribution.wallet_address.length - 4)}`
          : 'Unknown';
        
        const date = contribution.timestamp 
          ? new Date(contribution.timestamp).toLocaleString()
          : 'Unknown';
        
        console.log(`  ${index + 1}. ${colors.yellow}${walletPreview}${colors.reset} - ${formatSOL(contribution.amount)} - ${colors.dim}${date}${colors.reset}`);
      });
    }
    
    console.log('\n');
    console.log(`${colors.bright}${colors.magenta}╔════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.bright}${colors.magenta}║                  ${colors.yellow}Last Updated: ${new Date().toLocaleString()}${colors.magenta}        ║${colors.reset}`);
    console.log(`${colors.bright}${colors.magenta}╚════════════════════════════════════════════════════════════╝${colors.reset}`);
    console.log('\n');
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

// Run the main function
main()
  .then(() => {
    // Leave the dashboard displayed
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  }); 