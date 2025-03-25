// This file patches the Solana web3.js library to fix 403 errors
// by intercepting all RPC calls and redirecting them to a working endpoint

import { Connection, Commitment, GetLatestBlockhashConfig } from '@solana/web3.js';

// Define our working RPC endpoint - Alchemy is very reliable
const WORKING_RPC_ENDPOINT = "https://solana-mainnet.g.alchemy.com/v2/demo";

// Check if we've already applied the patch to avoid double patching
if (typeof window !== 'undefined' && !(window as any).__SOLANA_CONNECTION_PATCHED__) {
  // Mark as patched
  (window as any).__SOLANA_CONNECTION_PATCHED__ = true;
  console.log("🔧 Applying Solana connection patch");

  // Store the original methods we need to patch
  const originalGetLatestBlockhash = Connection.prototype.getLatestBlockhash;
  
  // Monkey patch the getLatestBlockhash method
  Connection.prototype.getLatestBlockhash = async function(
    commitmentOrConfig?: Commitment | GetLatestBlockhashConfig
  ) {
    try {
      // Instead of creating a new connection, we'll directly 
      // call the RPC endpoint ourselves to avoid 403 errors
      console.log("🔧 Using patched getLatestBlockhash with reliable endpoint");
      
      // Create a temporary connection with our reliable endpoint
      const alchemyConnection = new Connection(WORKING_RPC_ENDPOINT, { 
        commitment: "confirmed",
        confirmTransactionInitialTimeout: 60000
      });
      
      // Call the original method with our reliable connection
      return await originalGetLatestBlockhash.call(alchemyConnection, commitmentOrConfig);
    } catch (error) {
      console.error("Error in patched getLatestBlockhash:", error);
      throw error;
    }
  };
  
  console.log("🔧 Solana connection patch applied successfully");
}

// Export a utility function to create a reliable connection
export function createReliableConnection() {
  return new Connection(WORKING_RPC_ENDPOINT, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60000
  });
}

// Re-export just to ensure the file is imported
export default {
  createReliableConnection
}; 