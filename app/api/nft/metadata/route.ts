import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { PublicKey } from '@solana/web3.js'
import { POOKIE_COLLECTION_ADDRESS, getConnection, getUmi } from '@/utils/solana-nft'
import { fetchMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'

// Known metadata fallback paths for Pookie NFTs
const KNOWN_METADATA_BASE = 'https://arweave.net/DuHCK6NWnzZKUfNbTDvLMnkXKsZbD6iOaG3DDkXj3rs';

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
    let cleanedUri = metadataAccount.uri.toString().replace(/\0/g, '').trim();
    if (!cleanedUri || cleanedUri.length === 0) {
      throw new Error(`Empty metadata URI for mint: ${mintAddress}`);
    }
    
    // Normalize Arweave URI if needed
    if (cleanedUri.includes('arweave.net')) {
      if (cleanedUri.includes('https://www.arweave.net/')) {
        cleanedUri = cleanedUri.replace('https://www.arweave.net/', 'https://arweave.net/');
      }
    }
    
    // Fetch JSON metadata using URI
    try {
      const response = await axios.get(cleanedUri, { timeout: 10000 });
      
      // Verify if this is a Pookie NFT (collection check)
      const collectionKey = metadataAccount.collection?.key.toString();
      const isPookieByCollection = collectionKey === POOKIE_COLLECTION_ADDRESS;
      
      // Extract NFT number from name if available
      const metadataName = metadataAccount.name.toString().replace(/\0/g, '').trim();
      const nameMatch = metadataName.match(/Pookie #(\d+)/i);
      const nftNumber = nameMatch ? nameMatch[1] : null;
      
      // Ensure image URL is valid
      let imageUrl = response.data.image || null;
      
      if (!imageUrl && nftNumber) {
        // Try to construct known image URL pattern for Pookie NFTs
        imageUrl = `${KNOWN_METADATA_BASE}/${nftNumber}.png`;
      }
      
      return {
        ...response.data,
        mint: mintAddress,
        onChainName: metadataName,
        onChainSymbol: metadataAccount.symbol.toString().replace(/\0/g, '').trim(),
        collectionAddress: collectionKey,
        isPookieNFT: isPookieByCollection,
        nftNumber: nftNumber,
        image: imageUrl || response.data.image
      };
    } catch (fetchError) {
      console.error(`[Metadata API] Error fetching JSON from URI ${cleanedUri}:`, fetchError);
      
      // If URI fetch fails, try to use on-chain data and NFT number for fallback
      const metadataName = metadataAccount.name.toString().replace(/\0/g, '').trim();
      const nameMatch = metadataName.match(/Pookie #(\d+)/i);
      const nftNumber = nameMatch ? nameMatch[1] : null;
      
      let fallbackMetadata = {
        mint: mintAddress,
        name: metadataName,
        symbol: metadataAccount.symbol.toString().replace(/\0/g, '').trim(),
        collectionAddress: metadataAccount.collection?.key.toString(),
        uri: cleanedUri,
        nftNumber: nftNumber,
      };
      
      // Try to load a fallback image if we have an NFT number
      if (nftNumber) {
        try {
          const fallbackUri = `${KNOWN_METADATA_BASE}/${nftNumber}.json`;
          const fallbackResponse = await axios.get(fallbackUri, { timeout: 5000 });
          return {
            ...fallbackResponse.data,
            mint: mintAddress,
            onChainName: metadataName,
            onChainSymbol: metadataAccount.symbol.toString().replace(/\0/g, '').trim(),
            collectionAddress: metadataAccount.collection?.key.toString(),
            isPookieNFT: metadataAccount.collection?.key.toString() === POOKIE_COLLECTION_ADDRESS,
            nftNumber: nftNumber,
            uri: cleanedUri,
            fallbackUsed: true
          };
        } catch (fallbackError) {
          console.error(`[Metadata API] Fallback also failed for ${nftNumber}:`, fallbackError);
          // Use fixed path if fallback fails
          return {
            ...fallbackMetadata,
            image: `${KNOWN_METADATA_BASE}/${nftNumber}.png`, // Try direct image path
            fallbackUsed: true
          };
        }
      }
      
      // Return basic metadata if we couldn't get full data
      return fallbackMetadata;
    }
  } catch (error) {
    console.error(`[Metadata API] Error fetching metadata for mint ${mintAddress}:`, error);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const uri = searchParams.get('uri')
  const mint = searchParams.get('mint')
  const name = searchParams.get('name') // Add support for name-based lookup

  // Return error if neither URI nor mint is provided
  if (!uri && !mint && !name) {
    return NextResponse.json({ error: 'Missing URI, mint, or name parameter' }, { status: 400 })
  }

  // Name-based lookup for Pookie NFTs
  if (name && !mint && !uri) {
    try {
      // Extract number from "Pookie #123" format
      const nameMatch = name.match(/Pookie #(\d+)/i);
      const nftNumber = nameMatch ? nameMatch[1] : null;
      
      if (!nftNumber) {
        return NextResponse.json({ error: 'Invalid name format. Expected "Pookie #123"' }, { status: 400 });
      }
      
      // Try to fetch metadata for this NFT number
      const metadataUrl = `${KNOWN_METADATA_BASE}/${nftNumber}.json`;
      
      try {
        const response = await axios.get(metadataUrl, { timeout: 5000 });
        
        return NextResponse.json({
          ...response.data,
          nftNumber,
          lookupMethod: 'name'
        }, {
          headers: {
            'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL || '*',
            'Access-Control-Allow-Methods': 'GET',
            'Cache-Control': 's-maxage=300, stale-while-revalidate=600'
          }
        });
      } catch (e) {
        return NextResponse.json({ 
          error: 'Failed to fetch NFT metadata by name',
          name,
          nftNumber,
          fallbackImage: `${KNOWN_METADATA_BASE}/${nftNumber}.png`
        }, { status: 404 });
      }
    } catch (error: any) {
      console.error(`[Metadata API] Error handling name lookup for ${name}:`, error);
      return NextResponse.json({ 
        error: 'Failed to process name-based lookup',
        message: error.message || 'Unknown error'
      }, { status: 500 });
    }
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

      // Extract NFT number from metadata name or URI if available
      let nftNumber = null;
      if (response.data?.name && typeof response.data.name === 'string') {
        const nameMatch = response.data.name.match(/Pookie #(\d+)/i);
        nftNumber = nameMatch ? nameMatch[1] : null;
      }
      
      if (!nftNumber && decodedUri.includes('/')) {
        // Try to extract from URI path like "/123.json"
        const pathMatch = decodedUri.match(/\/(\d+)\.json$/);
        nftNumber = pathMatch ? pathMatch[1] : null;
      }
      
      // Add the NFT number to the response if found
      const enrichedResponse = {
        ...response.data,
        nftNumber,
        uriUsed: decodedUri
      };

      // Return the fetched metadata
      const headers = {
        'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL || '*',
        'Access-Control-Allow-Methods': 'GET',
        'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
      };
      
      return NextResponse.json(enrichedResponse, { headers });

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
      
      // Try to extract NFT number from URI if it's in a known format
      let nftNumber = null;
      if (decodedUri.includes('/')) {
        const pathMatch = decodedUri.match(/\/(\d+)\.json$/);
        nftNumber = pathMatch ? pathMatch[1] : null;
      }
      
      return NextResponse.json({ 
        error: message, 
        uri: decodedUri,
        nftNumber,
        fallbackImage: nftNumber ? `${KNOWN_METADATA_BASE}/${nftNumber}.png` : null
      }, { status });
    }
  }
} 