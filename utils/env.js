// Environment variables utility
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Staking configuration
export const STAKING_PROGRAM_ID = process.env.NEXT_PUBLIC_STAKING_PROGRAM_ID || '';
export const POOKIE_COLLECTION_ADDRESS = process.env.NEXT_PUBLIC_POOKIE_COLLECTION_ADDRESS || '';
export const POOKIE_TOKEN_MINT = process.env.NEXT_PUBLIC_POOKIE_TOKEN_MINT || '';
export const TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_ADDRESS || '';
export const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || '';
export const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || '';

// Utility functions to check if required env vars are present
export function hasRequiredSupabaseConfig() {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}

export function hasRequiredStakingConfig() {
  return !!STAKING_PROGRAM_ID && !!POOKIE_TOKEN_MINT && !!TREASURY_ADDRESS;
} 