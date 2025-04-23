#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const { Connection, PublicKey } = require('@solana/web3.js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Solana connection
const solanaRpc = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(solanaRpc);

// Treasury wallet address
const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET;

// Utility function to create a progress bar
function createProgressBar(progress, size = 30) {
  const filledLength = Math.round(size * progress);
  const emptyLength = size - filledLength;
  
  const filled = '█'.repeat(filledLength);
  const empty = '░'.repeat(emptyLength);
  
  return `${filled}${empty} ${(progress * 100).toFixed(2)}%`;
}

// Function to create a horizontal bar chart
function createBarChart(data, maxValue, width = 50) {
  let chart = '';
  
  for (const [label, value] of Object.entries(data)) {
    const barLength = Math.floor((value / maxValue) * width);
    const bar = '█'.repeat(barLength);
    chart += `${label.padEnd(15)}: ${bar} ${value}\n`;
  }
  
  return chart;
}

// Format SOL value with appropriate units
function formatSol(amount) {
  if (amount >= 1) {
    return `${amount.toFixed(2)} SOL`;
  } else {
    return `${(amount * 1000).toFixed(2)} mSOL`;
  }
}

async function main() {
  try {
    console.log('=== POOKIE Presale Visualization ===\n');
    
    // Get contribution data from Supabase
    console.log('Fetching contribution data...');
    const { data: contributions, error } = await supabase
      .from('contributions')
      .select('*')
      .order('created_at', { ascending: true });
      
    if (error) {
      console.error('Error fetching contributions:', error);
      return;
    }
    
    if (!contributions || contributions.length === 0) {
      console.log('No contributions found in the database.');
      return;
    }
    
    // Calculate presale stats
    const totalRaised = contributions.reduce((sum, c) => sum + parseFloat(c.amount), 0);
    const uniqueContributors = new Set(contributions.map(c => c.wallet_address)).size;
    const targetCap = 75; // SOL
    const progress = totalRaised / targetCap;
    
    // Get treasury balance from Solana
    let solanaBalance = 0;
    try {
      const treasuryPubkey = new PublicKey(treasuryWallet);
      const balance = await connection.getBalance(treasuryPubkey);
      solanaBalance = balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      console.error('Error fetching Solana balance:', error);
    }
    
    // Clear screen and display header
    console.clear();
    console.log('\x1b[36m%s\x1b[0m', '======================================');
    console.log('\x1b[36m%s\x1b[0m', '        POOKIE PRESALE DASHBOARD      ');
    console.log('\x1b[36m%s\x1b[0m', '======================================\n');
    
    // Display overall progress
    console.log('\x1b[33m%s\x1b[0m', 'PRESALE PROGRESS:');
    console.log(`[${createProgressBar(progress)}]`);
    console.log(`${totalRaised.toFixed(2)} SOL of ${targetCap} SOL target\n`);
    
    // Display key metrics
    console.log('\x1b[33m%s\x1b[0m', 'KEY METRICS:');
    console.log(`Total Contributors: ${uniqueContributors}`);
    console.log(`Average Contribution: ${(totalRaised / uniqueContributors).toFixed(2)} SOL`);
    console.log(`Recorded Contributions: ${totalRaised.toFixed(2)} SOL`);
    console.log(`Solana Treasury Balance: ${solanaBalance.toFixed(2)} SOL\n`);
    
    // Distribution by contribution size instead of tier
    console.log('\x1b[33m%s\x1b[0m', 'CONTRIBUTION BY SIZE:');
    const sizeBrackets = {
      'Small (<1 SOL)': 0,
      'Medium (1-5 SOL)': 0,
      'Large (5-10 SOL)': 0,
      'Whale (>10 SOL)': 0
    };
    
    contributions.forEach(c => {
      const amount = parseFloat(c.amount);
      if (amount < 1) {
        sizeBrackets['Small (<1 SOL)'] += amount;
      } else if (amount >= 1 && amount < 5) {
        sizeBrackets['Medium (1-5 SOL)'] += amount;
      } else if (amount >= 5 && amount < 10) {
        sizeBrackets['Large (5-10 SOL)'] += amount;
      } else {
        sizeBrackets['Whale (>10 SOL)'] += amount;
      }
    });
    
    const maxSizeValue = Math.max(...Object.values(sizeBrackets));
    console.log(createBarChart(sizeBrackets, maxSizeValue));
    
    // Show contribution timeline
    console.log('\x1b[33m%s\x1b[0m', 'CONTRIBUTION TIMELINE:');
    
    // Group by day for timeline
    const timeline = {};
    contributions.forEach(c => {
      const date = new Date(c.created_at).toISOString().split('T')[0];
      timeline[date] = (timeline[date] || 0) + parseFloat(c.amount);
    });
    
    // Sort timeline by date
    const sortedTimeline = Object.keys(timeline)
      .sort()
      .reduce((obj, key) => {
        obj[key] = timeline[key];
        return obj;
      }, {});
    
    const maxTimelineValue = Math.max(...Object.values(timeline));
    
    // Convert dates to more readable format
    const readableTimeline = {};
    for (const [date, value] of Object.entries(sortedTimeline)) {
      const [year, month, day] = date.split('-');
      readableTimeline[`${month}/${day}`] = value;
    }
    
    console.log(createBarChart(readableTimeline, maxTimelineValue));
    
    // Show recent activity
    console.log('\x1b[33m%s\x1b[0m', 'RECENT ACTIVITY:');
    const recentContributions = [...contributions]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);
    
    recentContributions.forEach(c => {
      const date = new Date(c.created_at).toLocaleString();
      const wallet = `${c.wallet_address.substring(0, 6)}...${c.wallet_address.substring(c.wallet_address.length - 4)}`;
      console.log(`${date} | ${wallet} | ${formatSol(parseFloat(c.amount))}`);
    });
    
    console.log('\n\x1b[36m%s\x1b[0m', '======================================');
    console.log('\x1b[90m%s\x1b[0m', `Last updated: ${new Date().toLocaleString()}`);
    console.log('\x1b[90m%s\x1b[0m', `Treasury address: ${treasuryWallet}`);
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

main()
  .then(() => {
    // Keep console open in non-interactive mode
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  }); 