import { NextRequest, NextResponse } from 'next/server';

// Access the SERVER-SIDE environment variable directly within the API route
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL_SERVER;

// Log the value when the server starts/restarts
console.log(`[RPC Proxy Startup] SOLANA_RPC_URL_SERVER: ${SOLANA_RPC_URL}`);

// Initial validation
if (!SOLANA_RPC_URL || !SOLANA_RPC_URL.startsWith('https://')) {
  console.error(`[RPC Proxy Startup Error] SOLANA_RPC_URL_SERVER is invalid or missing: ${SOLANA_RPC_URL}`);
}

export async function OPTIONS() {
  // Handle CORS preflight requests
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*', // Be more specific in production if possible
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    },
  });
}

export async function POST(request: NextRequest) {
  // Log the RPC URL value *when the request is handled*
  console.log(`[RPC Proxy Request] Using RPC URL (Server): ${SOLANA_RPC_URL}`);

  // Ensure RPC URL is available before processing
  if (!SOLANA_RPC_URL) {
    const errorMessage = 'Server configuration error: RPC endpoint not set (server-side).';
    console.error(`[RPC Proxy Error] ${errorMessage}`);
    return NextResponse.json(
      { 
        jsonrpc: '2.0', 
        error: { code: -32000, message: errorMessage }, 
        id: null 
      }, 
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }

  try {
    const body = await request.json();
    console.log('[RPC Proxy Request Body]:', JSON.stringify(body));

    // Forward the request ONLY to the configured RPC endpoint
    const response = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      // signal: AbortSignal.timeout(15000) // Consider adding timeout
    });

    // If response is not ok, return the error from the RPC node
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[RPC Proxy Error] Request to ${SOLANA_RPC_URL} failed with status ${response.status}: ${errorText}`);
      return new NextResponse(errorText, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Get the successful response data
    const data = await response.json();
    console.log(`[RPC Proxy Success] Using endpoint: ${SOLANA_RPC_URL}`);

    // Return the successful response
    return NextResponse.json(data, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    });

  } catch (error) {
    console.error('[RPC Proxy Catch Error]:', error);
    let errorMessage = 'Internal Server Error';
    let errorCode = -32603;
    let status = 500;

    if (error instanceof Error) {
      errorMessage = error.message;
      if (error.name === 'AbortError') {
        errorMessage = 'RPC request timed out';
        errorCode = -32000;
        status = 504; // Gateway Timeout
      }
    }
    
    let requestId = null;
    try {
      // Clone the request to read the body again safely
      const clonedRequest = request.clone();
      const body = await clonedRequest.json();
      requestId = body.id;
    } catch (_) {
      console.warn('[RPC Proxy Catch Error] Could not parse request body to get ID.');
    }

    return NextResponse.json(
      { 
        jsonrpc: '2.0', 
        error: { code: errorCode, message: errorMessage }, 
        id: requestId 
      }, 
      { status: status, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
} 