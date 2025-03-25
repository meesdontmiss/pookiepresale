"use client"

/**
 * This patch ensures a reliable Solana RPC endpoint is used throughout the application.
 * It overrides any other RPC endpoints to prevent CORS errors.
 */

// Use QuickNode's public endpoint which has higher rate limits and CORS enabled
const RELIABLE_ENDPOINT = "https://solana-mainnet.rpc.extrnode.com";

// Define the patch
export function patchSolanaRPC() {
  // Only run this in the browser
  if (typeof window !== 'undefined') {
    console.log("Applying Solana RPC patch...");
    
    // Override window.fetch to intercept Solana RPC calls
    const originalFetch = window.fetch;
    window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
      if (typeof input === 'string' && input.includes('solana') && input.includes('alchemy')) {
        console.log(`Redirecting RPC request from ${input} to ${RELIABLE_ENDPOINT}`);
        return originalFetch(RELIABLE_ENDPOINT, init);
      }
      return originalFetch(input, init);
    };
    
    console.log("Solana RPC patch applied");
  }
}

// Apply the patch immediately
patchSolanaRPC(); 