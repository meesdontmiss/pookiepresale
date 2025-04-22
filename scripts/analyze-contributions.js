#!/usr/bin/env node

// Script to analyze presale contributions and create a final count by tier
const fetch = require('node-fetch');
const fs = require('fs');

// Configuration - replace with your actual values
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Frickyes14'; // Will be prompted for this
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

async function main() {
  try {
    // Get admin password if not provided
    const password = ADMIN_PASSWORD;
    if (!password) {
      console.error('Please provide admin password via ADMIN_PASSWORD environment variable');
      process.exit(1);
    }

    // Login as admin
    console.log('Authenticating as admin...');
    const loginResponse = await fetch(`${BASE_URL}/api/admin/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });

    if (!loginResponse.ok) {
      throw new Error(`Admin login failed: ${loginResponse.status} ${loginResponse.statusText}`);
    }

    const loginData = await loginResponse.json();
    const adminToken = loginData.token;

    if (!adminToken) {
      throw new Error('Admin login successful but no token returned');
    }

    console.log('Authentication successful');

    // Fetch all contributions
    console.log('Fetching contribution data...');
    const statsResponse = await fetch(`${BASE_URL}/api/admin/stats`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
      },
    });

    if (!statsResponse.ok) {
      throw new Error(`Failed to fetch stats: ${statsResponse.status} ${statsResponse.statusText}`);
    }

    const statsData = await statsResponse.json();
    
    if (!statsData.success) {
      throw new Error(`Stats API returned error: ${statsData.error || 'Unknown error'}`);
    }

    const { totalRaised, uniqueContributors, averageContribution, tiers, recentContributions } = statsData.stats;

    // Now fetch all contributions to get detailed data
    console.log('Fetching all contributions...');
    const allContributions = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const contribResponse = await fetch(
        `${BASE_URL}/api/admin/contributions?limit=${limit}&offset=${offset}&status=confirmed`, 
        {
          headers: {
            'Authorization': `Bearer ${adminToken}`,
          },
        }
      );

      if (!contribResponse.ok) {
        throw new Error(`Failed to fetch contributions: ${contribResponse.status} ${contribResponse.statusText}`);
      }

      const contribData = await contribResponse.json();
      
      if (!contribData.success || !contribData.data) {
        throw new Error(`Contributions API returned error: ${contribData.error || 'Unknown error'}`);
      }

      allContributions.push(...contribData.data);
      
      if (contribData.data.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    }

    console.log(`Retrieved ${allContributions.length} total contributions`);

    // Analyze contributions by tier and wallet
    const tierSummary = {};
    const walletContributions = {};
    const tierCounts = {};

    // Process all contributions
    allContributions.forEach(contribution => {
      const { wallet_address, amount, transaction_signature } = contribution;
      
      // Infer tier based on amount
      const tier = inferTier(amount);
      
      // Add to tier summary
      tierSummary[tier] = (tierSummary[tier] || 0) + amount;
      
      // Count contributors in each tier
      if (!tierCounts[tier]) {
        tierCounts[tier] = new Set();
      }
      tierCounts[tier].add(wallet_address);
      
      // Track contributions by wallet
      if (!walletContributions[wallet_address]) {
        walletContributions[wallet_address] = {
          total: 0,
          contributions: [],
        };
      }
      
      walletContributions[wallet_address].total += amount;
      walletContributions[wallet_address].contributions.push({
        amount,
        tier,
        transaction_signature,
        timestamp: contribution.timestamp || contribution.created_at,
      });
    });

    // Convert Sets to counts
    const tierContributorCounts = {};
    Object.keys(tierCounts).forEach(tier => {
      tierContributorCounts[tier] = tierCounts[tier].size;
    });

    // Sort wallets by total contribution amount (descending)
    const sortedWallets = Object.entries(walletContributions)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([wallet, data]) => ({
        wallet,
        total: data.total,
        contributionCount: data.contributions.length,
      }));

    // Generate report
    const report = {
      summary: {
        totalRaised,
        uniqueContributors,
        averageContribution,
      },
      tierBreakdown: {
        amounts: tierSummary,
        contributors: tierContributorCounts,
      },
      topContributors: sortedWallets.slice(0, 20), // Top 20 contributors
    };

    // Write to file
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const reportFilename = `presale-summary-${timestamp}.json`;
    fs.writeFileSync(reportFilename, JSON.stringify(report, null, 2));

    // Generate human-readable report
    const readableReport = `# POOKIE Presale Final Report

## Summary
- Total Raised: ${totalRaised.toFixed(4)} SOL
- Unique Contributors: ${uniqueContributors}
- Average Contribution: ${averageContribution.toFixed(4)} SOL

## Contribution by Tier
${Object.entries(tierSummary)
  .sort((a, b) => b[1] - a[1])
  .map(([tier, amount]) => 
    `- ${tier === 'core' ? 'Private Sale (Core)' : tier === 'public' ? 'Public Sale' : tier}: ${amount.toFixed(4)} SOL (${tierContributorCounts[tier] || 0} contributors)`)
  .join('\n')}

## Top Contributors
${sortedWallets.slice(0, 10).map((w, i) => 
  `${i+1}. ${w.wallet}: ${w.total.toFixed(4)} SOL (${w.contributionCount} contributions)`)
  .join('\n')}

_Report generated on ${new Date().toLocaleString()}_
`;

    const readableReportFilename = `presale-summary-${timestamp}.md`;
    fs.writeFileSync(readableReportFilename, readableReport);

    console.log(`Report generated: ${reportFilename} and ${readableReportFilename}`);
    console.log('\n--- Summary ---');
    console.log(`Total Raised: ${totalRaised.toFixed(4)} SOL`);
    console.log(`Unique Contributors: ${uniqueContributors}`);
    
    console.log('\n--- Contribution by Tier ---');
    Object.entries(tierSummary)
      .sort((a, b) => b[1] - a[1])
      .forEach(([tier, amount]) => {
        console.log(`${tier}: ${amount.toFixed(4)} SOL (${tierContributorCounts[tier] || 0} contributors)`);
      });

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Helper function to infer tier based on amount
function inferTier(amount) {
  if (amount >= 0.5) return 'core'; // Private sale (0.5 SOL and above)
  if (amount <= 0.25) return 'public'; // Public sale (0.25 SOL)
  return 'unknown'; // Other amounts
}

main(); 