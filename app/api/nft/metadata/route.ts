import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { PublicKey } from '@solana/web3.js'
import { POOKIE_COLLECTION_ADDRESS, getConnection, getUmi } from '@/utils/solana-nft'
import { fetchMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'

/**
 * Fetch metadata using mint address
 */
async function fetchNftMetadataByMint(mintAddress: string) {
  try {
    console.log(`[Metadata API] Fetching metadata for mint: ${mintAddress}`);
    
    // Use the shared UMI instance
    const umi = getUmi();
    
    // Convert mint to UMI format
    const mintPubKey = fromWeb3JsPublicKey(new PublicKey(mintAddress));
    
    // Fetch on-chain metadata
    const metadataAccount = await fetchMetadata(umi, mintPubKey);
    if (!metadataAccount) {
      throw new Error(`No metadata found for mint: ${mintAddress}`);
    }
    
    // Get metadata URI
    const cleanedUri = metadataAccount.uri.toString().replace(/\0/g, '').trim();
    if (!cleanedUri || cleanedUri.length === 0) {
      throw new Error(`Empty metadata URI for mint: ${mintAddress}`);
    }
    
    // Fetch JSON metadata using URI
    const response = await axios.get(cleanedUri, { timeout: 10000 });
    
    // Verify if this is a Pookie NFT (collection check)
    const collectionKey = metadataAccount.collection?.key.toString();
    const isPookieByCollection = collectionKey === POOKIE_COLLECTION_ADDRESS;
    const isPookieByName = (metadataAccount.name.toString().toLowerCase().includes('pookie') || 
                           response.data?.name?.toLowerCase().includes('pookie'));
    
    if (!isPookieByCollection && !isPookieByName) {
      console.warn(`[Metadata API] Not a Pookie NFT: ${mintAddress}`);
      // Return basic data anyway so client can decide
    }
    
    return {
      ...response.data,
      mint: mintAddress,
      onChainName: metadataAccount.name.toString(),
      onChainSymbol: metadataAccount.symbol.toString(),
      collectionAddress: collectionKey,
      isPookieNFT: isPookieByCollection || isPookieByName
    };
  } catch (error) {
    console.error(`[Metadata API] Error fetching metadata for mint ${mintAddress}:`, error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const uri = searchParams.get('uri')
  const mint = searchParams.get('mint')

  // Return error if neither URI nor mint is provided
  if (!uri && !mint) {
    return NextResponse.json({ error: 'Missing URI or mint parameter' }, { status: 400 })
  }

  // If mint is provided, use mint-based fetching
  if (mint) {
    try {
      // Validate mint address format
      if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
        return NextResponse.json({ error: 'Invalid mint address format' }, { status: 400 })
      }
      
      const metadata = await fetchNftMetadataByMint(mint);
      
      return NextResponse.json(metadata, {
        headers: {
          'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL || '*',
          'Access-Control-Allow-Methods': 'GET',
          'Cache-Control': 's-maxage=300, stale-while-revalidate=600', // Cache for 5 min, allow stale for 10 min
        }
      });
    } catch (error: any) {
      console.error(`[Metadata API] Error handling mint ${mint}:`, error);
      return NextResponse.json({ 
        error: 'Failed to fetch NFT metadata by mint',
        message: error.message || 'Unknown error'
      }, { status: 500 })
    }
  }

  // URI-based fetching (existing functionality)
  if (uri) {
    let decodedUri: string;
    try {
      decodedUri = decodeURIComponent(uri);
    } catch (e) {
      return NextResponse.json({ error: 'Invalid URI encoding' }, { status: 400 })
    }

    // Basic validation: Check if it looks like an HTTP(S) URL
    if (!decodedUri.startsWith('http://') && !decodedUri.startsWith('https://')) {
       return NextResponse.json({ error: 'Invalid URI format' }, { status: 400 })
    }

    try {
      console.log(`[Metadata API] Proxying metadata fetch for URI: ${decodedUri}`);
      const response = await axios.get(decodedUri, {
        timeout: 10000, // 10 seconds
        validateStatus: function (status) {
          return status >= 200 && status < 500; // Allow 2xx, 3xx, 4xx
        },
      });

      if (response.status >= 400) {
         console.error(`[Metadata API] Gateway returned status ${response.status} for ${decodedUri}`);
         return NextResponse.json({ error: `Gateway error: ${response.status}` }, { status: response.status })
      }

      // Return the fetched metadata
      const headers = {
        'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL || '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      };
      
      return NextResponse.json(response.data, { headers });

    } catch (error: any) {
      console.error(`[Metadata API] Error fetching metadata via proxy for ${decodedUri}:`, error);
      // Handle different error types (e.g., timeout, network error)
      let status = 500;
      let message = 'Failed to fetch metadata';
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED') {
          status = 504; // Gateway Timeout
          message = 'Gateway timeout fetching metadata';
        }
      }
      return NextResponse.json({ error: message }, { status });
    }
  }
} 