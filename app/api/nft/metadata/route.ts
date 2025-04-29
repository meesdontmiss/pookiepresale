import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

// Whitelist of allowed IPFS gateways (optional but recommended for security)
// const ALLOWED_GATEWAYS = [
//   'https://gateway.pinata.cloud/ipfs/',
//   'https://ipfs.io/ipfs/',
//   'https://*.ipfs.dweb.link/'
// ];

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const uri = searchParams.get('uri')

  if (!uri) {
    return NextResponse.json({ error: 'Missing URI parameter' }, { status: 400 })
  }

  let decodedUri: string;
  try {
    decodedUri = decodeURIComponent(uri);
  } catch (e) {
    return NextResponse.json({ error: 'Invalid URI encoding' }, { status: 400 })
  }

  // Basic validation: Check if it looks like an HTTP(S) URL
  // A more robust check could involve checking against ALLOWED_GATEWAYS
  if (!decodedUri.startsWith('http://') && !decodedUri.startsWith('https://')) {
     return NextResponse.json({ error: 'Invalid URI format' }, { status: 400 })
  }

  try {
    console.log(`Proxying metadata fetch for URI: ${decodedUri}`); // Server-side log
    const response = await axios.get(decodedUri, {
      // Set a reasonable timeout
      timeout: 10000, // 10 seconds
      // Important: Prevent axios from throwing on non-2xx status codes
      // so we can potentially handle different gateway responses gracefully
      validateStatus: function (status) {
        return status >= 200 && status < 500; // Allow 2xx, 3xx, 4xx
      },
    });

    if (response.status >= 400) {
       console.error(`IPFS gateway returned status ${response.status} for ${decodedUri}`);
       return NextResponse.json({ error: `Gateway error: ${response.status}` }, { status: response.status })
    }

    // Return the fetched metadata
    // Set CORS headers to allow your frontend domain
    const headers = {
      'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL || '*', // Be specific in production!
      'Access-Control-Allow-Methods': 'GET',
      'Cache-Control': 's-maxage=60, stale-while-revalidate=300', // Cache for 1 min, allow stale for 5 min
    };
    
    return NextResponse.json(response.data, { headers });

  } catch (error: any) {
    console.error(`Error fetching metadata via proxy for ${decodedUri}:`, error);
    // Handle different error types (e.g., timeout, network error)
    let status = 500;
    let message = 'Failed to fetch metadata';
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED') {
        status = 504; // Gateway Timeout
        message = 'Gateway timeout fetching metadata';
      }
      // Could add more specific checks here
    }
    return NextResponse.json({ error: message }, { status });
  }
} 