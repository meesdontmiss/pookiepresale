#!/usr/bin/env ts-node

/**
 * Presale Contributions Analysis Script
 * 
 * This script analyzes the presale contributions and generates a final count by tier.
 * Run with:
 *   npx ts-node scripts/analyze-contributions.ts
 * 
 * Make sure you have the necessary environment variables set up (.env.local or in your environment):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

type Contribution = {
  id: number;
  wallet_address: string;
  amount: number;
  transaction_id?: string;
  transaction_signature?: string;
  timestamp?: string;
  created_at?: string;
  is_verified: boolean;
  tier?: 'public' | 'core' | string;
};

type WalletSummary = {
  wallet: string;
  total: number;
  contributionCount: number;
};

async function main() {
  try {
    // Initialize Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase credentials. Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local');
      process.exit(1);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Fetching all contributions...');
    
    // Query all verified contributions
    const { data: contributions, error } = await supabase
      .from('contributions')
      .select('*')
      .eq('is_verified', true)
      .order('timestamp', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch contributions: ${error.message}`);
    }

    if (!contributions || contributions.length === 0) {
      console.log('No contributions found');
      process.exit(0);
    }

    console.log(`Retrieved ${contributions.length} total contributions`);

    // Calculate summary metrics
    const totalRaised = contributions.reduce((sum, c) => sum + c.amount, 0);
    const uniqueWallets = new Set(contributions.map(c => c.wallet_address)).size;
    const averageContribution = totalRaised / uniqueWallets;

    // Analyze by tier
    const tierSummary: Record<string, number> = {};
    const walletContributions: Record<string, { total: number; contributions: any[] }> = {};
    const tierCounts: Record<string, Set<string>> = {};

    // Process each contribution
    contributions.forEach((contribution: Contribution) => {
      const { wallet_address, amount, tier = 'unknown' } = contribution;
      
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
        transaction_signature: contribution.transaction_signature,
        timestamp: contribution.timestamp || contribution.created_at,
      });
    });

    // Convert Sets to counts
    const tierContributorCounts: Record<string, number> = {};
    Object.keys(tierCounts).forEach(tier => {
      tierContributorCounts[tier] = tierCounts[tier].size;
    });

    // Sort wallets by total contribution amount (descending)
    const sortedWallets: WalletSummary[] = Object.entries(walletContributions)
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
        uniqueContributors: uniqueWallets,
        averageContribution,
      },
      tierBreakdown: {
        amounts: tierSummary,
        contributors: tierContributorCounts,
      },
      topContributors: sortedWallets.slice(0, 20), // Top 20 contributors
      allContributions: contributions.length,
    };

    // Create directory for reports if it doesn't exist
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir);
    }

    // Write to file
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/g, '');
    const reportFilename = path.join(reportsDir, `presale-summary-${timestamp}.json`);
    fs.writeFileSync(reportFilename, JSON.stringify(report, null, 2));

    // Generate human-readable report
    const readableReport = `# POOKIE Presale Final Report

## Summary
- Total Raised: ${totalRaised.toFixed(4)} SOL
- Unique Contributors: ${uniqueWallets}
- Average Contribution: ${averageContribution.toFixed(4)} SOL
- Total Contributions: ${contributions.length}

## Contribution by Tier
${Object.entries(tierSummary)
  .sort((a, b) => b[1] - a[1])
  .map(([tier, amount]) => {
    const tierName = tier === 'core' ? 'Private Sale (Core)' : 
                   tier === 'public' ? 'Public Sale' : 
                   tier;
    return `- ${tierName}: ${amount.toFixed(4)} SOL (${tierContributorCounts[tier] || 0} contributors)`;
  })
  .join('\n')}

## Top Contributors
${sortedWallets.slice(0, 10).map((w, i) => 
  `${i+1}. ${w.wallet}: ${w.total.toFixed(4)} SOL (${w.contributionCount} contributions)`)
  .join('\n')}

## Tier Distribution
Public Sale: ${tierSummary['public'] ? ((tierSummary['public'] / totalRaised) * 100).toFixed(2) : 0}%
Private Sale: ${tierSummary['core'] ? ((tierSummary['core'] / totalRaised) * 100).toFixed(2) : 0}%

_Report generated on ${new Date().toLocaleString()}_
`;

    const readableReportFilename = path.join(reportsDir, `presale-summary-${timestamp}.md`);
    fs.writeFileSync(readableReportFilename, readableReport);

    console.log(`\nReport generated in ${reportsDir}:`);
    console.log(`- JSON: presale-summary-${timestamp}.json`);
    console.log(`- Markdown: presale-summary-${timestamp}.md`);
    
    console.log('\n--- Summary ---');
    console.log(`Total Raised: ${totalRaised.toFixed(4)} SOL`);
    console.log(`Unique Contributors: ${uniqueWallets}`);
    console.log(`Average Contribution: ${averageContribution.toFixed(4)} SOL`);
    
    console.log('\n--- Contribution by Tier ---');
    Object.entries(tierSummary)
      .sort((a, b) => b[1] - a[1])
      .forEach(([tier, amount]) => {
        const tierName = tier === 'core' ? 'Private Sale (Core)' : 
                       tier === 'public' ? 'Public Sale' : 
                       tier;
        console.log(`${tierName}: ${amount.toFixed(4)} SOL (${tierContributorCounts[tier] || 0} contributors) - ${((amount / totalRaised) * 100).toFixed(2)}%`);
      });

    console.log('\n--- Top 5 Contributors ---');
    sortedWallets.slice(0, 5).forEach((wallet, index) => {
      console.log(`${index + 1}. ${wallet.wallet}: ${wallet.total.toFixed(4)} SOL (${wallet.contributionCount} contributions)`);
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main(); 