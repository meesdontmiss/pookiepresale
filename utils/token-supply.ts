/**
 * This file contains utility functions for handling token supply calculations
 * All values are calculated based on percentages to allow for flexibility
 */

// Total token supply - 1 billion POOKIE
export const TOTAL_SUPPLY = parseInt(process.env.NEXT_PUBLIC_TOKEN_TOTAL_SUPPLY || "1000000000");

// Percentage of total supply allocated to presale (5% = 50M tokens)
export const PRESALE_ALLOCATION_PERCENTAGE = parseFloat(process.env.NEXT_PUBLIC_PRESALE_ALLOCATION_PERCENTAGE || "5") / 100;

// Maximum SOL to be raised
export const MAX_SOL_CAP = parseInt(process.env.NEXT_PUBLIC_MAX_SOL_CAP || "50");

// Tokens per SOL calculation
export const TOKENS_PER_SOL = parseInt(process.env.NEXT_PUBLIC_TOKEN_RATE || "1000000");

// Token decimals (typically 9 for Solana SPL tokens)
export const TOKEN_DECIMALS = parseInt(process.env.NEXT_PUBLIC_TOKEN_DECIMALS || "9");

/**
 * Calculate the number of tokens for a given SOL amount
 * @param solAmount Amount of SOL contributed
 * @param bonusPercentage Bonus percentage to apply
 * @returns Object containing base tokens, bonus tokens, and total tokens
 */
export function calculateTokens(solAmount: number, bonusPercentage: number = 0) {
  const baseTokens = solAmount * TOKENS_PER_SOL;
  const bonusTokens = baseTokens * (bonusPercentage / 100);
  const totalTokens = baseTokens + bonusTokens;
  
  return {
    baseTokens,
    bonusTokens,
    totalTokens
  };
}

/**
 * Calculate the total presale allocation in tokens
 * @returns Total presale allocation in tokens
 */
export function getPresaleAllocation() {
  return TOTAL_SUPPLY * PRESALE_ALLOCATION_PERCENTAGE;
}

/**
 * Calculate the percentage of presale allocation a contribution represents
 * @param solAmount Amount of SOL contributed
 * @returns Percentage of presale allocation
 */
export function getContributionPercentage(solAmount: number) {
  return (solAmount / MAX_SOL_CAP) * 100;
}

/**
 * Format a token amount for display (with appropriate commas and decimal places)
 * @param amount Token amount to format
 * @returns Formatted token amount string
 */
export function formatTokenAmount(amount: number) {
  return amount.toLocaleString(undefined, { 
    maximumFractionDigits: 0 
  });
}

/**
 * Format a percentage for display
 * @param percentage Percentage to format
 * @returns Formatted percentage string
 */
export function formatPercentage(percentage: number) {
  return percentage.toLocaleString(undefined, { 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2 
  }) + '%';
} 