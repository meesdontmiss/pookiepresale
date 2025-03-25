import { NextRequest, NextResponse } from 'next/server';

// Define Solana RPC endpoints - use multiple for redundancy
const RPC_ENDPOINTS = [
  // Add reliable paid endpoints first
  "https://rpc.helius.xyz/?api-key=28cda6d9-5527-4c12-a0b3-cf2c6e54c1a4", // Helius RPC
  "https://solana-mainnet.phantom.tech/YBPpkkN4g91xDiAnTE9r0RcMkjg0sKUIWvAfoFVJ", // Phantom public RPC
  "https://solana-mainnet.rpc.extrnode.com", // ExtrNode public RPC
  // Add free endpoints as fallbacks
  "https://api.mainnet-beta.solana.com", // Official Solana RPC (often rate-limited)
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", // Configured RPC
];

export async function OPTIONS() {
  // Handle CORS preflight requests
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Get the request body
    const body = await request.json();
    
    // Log the request for debugging
    console.log('RPC Proxy Request:', JSON.stringify(body));
    
    // Try each endpoint until one works
    let lastError: Error | null = null;
    for (const endpoint of RPC_ENDPOINTS) {
      try {
        // Forward the request to the RPC endpoint
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        
        // If response is not ok, throw error
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`RPC request failed with status ${response.status}: ${errorText}`);
        }
        
        // Get the response data
        const data = await response.json();
        
        // Log success endpoint
        console.log(`RPC Proxy Success using endpoint: ${endpoint}`);
        
        // Return the response with CORS headers
        return NextResponse.json(data, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Content-Type': 'application/json',
          },
        });
      } catch (error) {
        // Log the error and try the next endpoint
        console.warn(`RPC endpoint ${endpoint} failed:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    
    // If all endpoints failed, return an error
    console.error('All RPC endpoints failed:', lastError);
    return NextResponse.json(
      { 
        jsonrpc: '2.0', 
        error: { 
          code: -32603, 
          message: 'Internal server error: All RPC endpoints failed' 
        }, 
        id: body.id 
      }, 
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    // Handle JSON parsing errors or other unexpected errors
    console.error('RPC Proxy error:', error);
    return NextResponse.json(
      { 
        jsonrpc: '2.0', 
        error: { 
          code: -32700, 
          message: 'Parse error' 
        }, 
        id: null 
      }, 
      { 
        status: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Content-Type': 'application/json',
        },
      }
    );
  }
} 