import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { PublicKey } from '@solana/web3.js'
import { POOKIE_COLLECTION_ADDRESS, getConnection, getUmi } from '@/utils/solana-nft'
import { fetchMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'

/**
 * Validate and clean image URL
 */
function processImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  
  try {
    // Remove any null terminators and trim
    const cleaned = imageUrl.toString().replace(/\0/g, '').trim();
    
    if (!cleaned || cleaned.length === 0) return null;
    
    // Check if it's a valid URL or path
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://') || cleaned.startsWith('/')) {
      return cleaned;
    }
    
    // Handle arweave and ipfs
    if (cleaned.startsWith('ar://')) {
      return `https://arweave.net/${cleaned.substring(5)}`;
    }
    
    if (cleaned.startsWith('ipfs://')) {
      // Convert IPFS to HTTP gateway URL
      return `https://ipfs.io/ipfs/${cleaned.substring(7)}`;
    }
    
    return null;
  } catch (e) {
    console.error('[processImageUrl] Error processing image URL:', e);
    return null;
  }
}

/**
 * Validate metadata to ensure it has required fields
 */
function isValidMetadata(data: any): boolean {
  // Basic structural check
  if (!data || typeof data !== 'object') {
    return false;
  }
  
  // Check for common NFT metadata fields
  if (!data.name) {
    console.warn('[Metadata API] Metadata missing name field');
    return false;
  }
  
  // If it has attributes, it's very likely to be NFT metadata
  if (Array.isArray(data.attributes)) {
    return true;
  }
  
  // Check for other common Metaplex metadata fields
  if (data.image || data.animation_url || data.properties) {
    return true;
  }
  
  // Could add more checks for specific Pookie NFT signatures
  
  return false;
}

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
    
    // Log URI for debugging
    console.log(`[Metadata API] URI for ${mintAddress}: ${cleanedUri}`);
    
    // Fetch JSON metadata using URI with extended timeout and retry
    let response;
    try {
      response = await axios.get(cleanedUri, { timeout: 15000 });
    } catch (firstError) {
      console.warn(`[Metadata API] First attempt to fetch URI failed: ${cleanedUri}`, firstError);
      // Retry once with longer timeout
      response = await axios.get(cleanedUri, { timeout: 20000 });
    }
    
    // Process and validate response data
    const metadata = response.data;
    
    // Validate metadata structure
    if (!isValidMetadata(metadata)) {
      console.warn(`[Metadata API] Invalid metadata structure for ${mintAddress}`);
      // Return minimal valid metadata with on-chain info
      return {
        mint: mintAddress,
        name: metadataAccount.name.toString() || `NFT ${mintAddress.slice(0, 6)}`,
        symbol: metadataAccount.symbol.toString() || '',
        image: null,
        onChainName: metadataAccount.name.toString(),
        onChainSymbol: metadataAccount.symbol.toString(),
        isPookieNFT: true // Assume it's valid since it's in our collection
      };
    }
    
    // Process and validate image URLs
    const rawImageUrl = metadata.image;
    const imageUrl = processImageUrl(rawImageUrl);
    
    // Check for alternative image URLs
    const alternativeImageUrls = [
      metadata.image_url,
      metadata.imageUrl,
      metadata.image_uri,
      metadata.imageUri,
    ].map(url => processImageUrl(url)).filter(Boolean);
    
    // Verify if this is a Pookie NFT (collection check)
    const collectionKey = metadataAccount.collection?.key.toString();
    const isPookieByCollection = collectionKey === POOKIE_COLLECTION_ADDRESS;
    
    if (!isPookieByCollection) {
      console.warn(`[Metadata API] Not a Pookie NFT: ${mintAddress}`);
      // Return basic data anyway so client can decide
    }
    
    return {
      ...metadata,
      mint: mintAddress,
      onChainName: metadataAccount.name.toString(),
      onChainSymbol: metadataAccount.symbol.toString(),
      collectionAddress: collectionKey,
      isPookieNFT: isPookieByCollection,
      // Include all potential image URLs for client to try
      imageUrl: imageUrl,
      alternativeImageUrls: alternativeImageUrls,
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
        message: error.message || 'Unknown error',
        mint: mint, // Include mint in response to help client with retries
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