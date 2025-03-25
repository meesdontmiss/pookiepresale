// This script can be included directly in the HTML head
// to patch the Solana connection before the app even loads

(function() {
  // Store the original fetch function
  const originalFetch = window.fetch;

  // Define our reliable RPC endpoint
  const WORKING_RPC_ENDPOINT = "https://solana-mainnet.g.alchemy.com/v2/demo";

  // Override the fetch function to intercept RPC calls to Solana
  window.fetch = function(url, options) {
    // Check if this is a Solana RPC request that might result in a 403
    if (options && 
        typeof url === 'string' && 
        url.includes('solana') && 
        options.method === 'POST' && 
        options.body) {
      try {
        const body = JSON.parse(options.body.toString());
        
        // Check if this is a getLatestBlockhash request
        if (body.method === 'getLatestBlockhash' ||
            body.method === 'getRecentBlockhash') {
          console.log('🔧 RPC patch: Intercepting', body.method, 'request - redirecting to Alchemy');
          
          // Redirect this request to our reliable endpoint
          return originalFetch(WORKING_RPC_ENDPOINT, options);
        }
      } catch (e) {
        // If we can't parse the body, just let it through
      }
    }
    
    // Pass through all other requests normally
    return originalFetch(url, options);
  };
  
  console.log('🔧 RPC patch: Fetch interceptor installed');
  
  // Mark that we've applied the patch
  window.__SOLANA_RPC_PATCHED__ = true;
})(); 