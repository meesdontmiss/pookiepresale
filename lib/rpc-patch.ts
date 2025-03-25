"use client"

/**
 * This patch ensures a reliable Solana RPC endpoint is used throughout the application.
 * It overrides any other RPC endpoints to prevent CORS errors.
 */

// Use our API proxy endpoint which handles multiple RPC endpoints with fallbacks
const RELIABLE_ENDPOINT = "/api/rpc/proxy";

// Define the patch
export function patchSolanaRPC() {
  // Only run this in the browser
  if (typeof window !== 'undefined') {
    console.log("Applying Solana RPC patch...");
    
    // Override window.fetch to intercept Solana RPC calls
    const originalFetch = window.fetch;
    window.fetch = function(input: RequestInfo | URL, init?: RequestInit) {
      // Check if this is a Solana RPC request to mainnet
      if (
        typeof input === 'string' && 
        (
          // Match all common Solana RPC endpoints
          input.includes('api.mainnet-beta.solana.com') ||
          input.includes('solana-mainnet') ||
          input.includes('solana-api') ||
          input.includes('helius.xyz') ||
          input.includes('alchemy.com') ||
          input.includes('rpc.ankr.com') ||
          // Avoid intercepting our own proxy calls
          (input.includes('solana') && !input.includes('/api/rpc/proxy'))
        )
      ) {
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