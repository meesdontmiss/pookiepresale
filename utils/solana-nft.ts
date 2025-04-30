import { Connection, PublicKey } from '@solana/web3.js'
import axios from 'axios'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { fetchMetadata, mplTokenMetadata, TokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import type { Umi } from '@metaplex-foundation/umi'

// The collection address for Pookie NFTs
export const POOKIE_COLLECTION_ADDRESS = process.env.NEXT_PUBLIC_POOKIE_COLLECTION_ADDRESS || 'ASky6aQmJxKn3cd1D7z6qoXnfV4EoWwe2RT1kM7BDWCQ'

// Singleton connection instance to prevent multiple connections
let _connection: Connection | null = null;
let _umi: Umi | null = null;

// Define proxy endpoint logic centrally
function getRpcEndpoint() {
  if (typeof window !== 'undefined') {
    // Must use absolute URL for client-side
    const baseUrl = window.location.origin;
    return `${baseUrl}/api/rpc/proxy`;
  }
  // Fallback for potential server-side usage (though less likely for these funcs)
  return process.env.SOLANA_RPC_URL_SERVER || process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
}

// Get the shared connection instance
export function getConnection(): Connection {
  if (!_connection) {
    console.log('Creating new Solana connection instance');
    const endpoint = getRpcEndpoint();
    _connection = new Connection(endpoint, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    });
  }
  return _connection;
}

// Get shared UMI instance with token metadata
export function getUmi(): Umi {
  if (!_umi) {
    console.log('Creating new UMI instance');
    const connection = getConnection();
    const baseUmi = createUmi(connection.rpcEndpoint);
    const plugin = mplTokenMetadata();
    plugin.install(baseUmi);
    _umi = baseUmi;
  }
  return _umi;
}

// NFT interface
export interface NFT {
  mint: string
  name: string
  image: string
  symbol?: string
  attributes?: any[]
  collectionAddress?: string | null
}

// Token account interface
interface TokenAccount {
  account: {
    data: {
      parsed: {
        info: {
          mint: string
          tokenAmount: {
            uiAmount: number
            decimals: number
          }
        }
      }
    }
  }
}

// Creator interface for metadata
interface Creator {
  address: { toString: () => string };
  verified: boolean;
  share: number;
}

// Modified metadata interface that includes creators
interface ExtendedMetadata extends TokenMetadata {
  creators?: Creator[];
}

/**
 * Get NFT metadata from account data using Umi
 */
async function parseNFTMetadata(mintAddress: string): Promise<NFT | null> {
  console.log(`Starting metadata parse for mint: ${mintAddress}`);
  try {
    // Use the shared UMI instance
    const umi = getUmi();

    // Convert Solana PublicKey to UMI format
    const mintPubKey = fromWeb3JsPublicKey(new PublicKey(mintAddress));
    console.log('Fetching metadata account...');

    // Fetch metadata with better error handling
    const metadataAccount = await fetchMetadata(umi, mintPubKey).catch((error: any) => {
      console.warn(`Error fetching metadata for ${mintAddress}:`, error?.message || error);
      return null;
    });

    if (!metadataAccount) {
      console.warn(`No metadata account found for mint: ${mintAddress}`);
      return null;
    }

    // Clean the URI and log it for debugging
    const cleanedUri = metadataAccount.uri.toString().replace(/\0/g, '').trim();
    console.log('Metadata URI:', cleanedUri);
    
    try {
      // Fetch metadata with improved retry logic
      const fetchMetadataWithRetry = async (retries = 3): Promise<any> => {
        try {
          console.log(`Fetching metadata from URI, attempt ${4 - retries}/3`);
          const response = await axios.get(cleanedUri, { 
            timeout: 5000,
            headers: {
              'Accept': 'application/json',
              'Cache-Control': 'no-cache'
            }
          });
          return response.data;
        } catch (error: any) {
          console.log('Metadata fetch error:', error?.message || error);
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return fetchMetadataWithRetry(retries - 1);
          }
          throw error;
        }
      };

      const metadata = await fetchMetadataWithRetry();

      // Enhanced collection verification with more flexible checks
      const collectionKey = metadataAccount.collection?.key.toString();
      console.log('Collection verification:', {
        nftMint: mintAddress,
        collectionKey,
        expectedCollection: POOKIE_COLLECTION_ADDRESS,
        matches: collectionKey === POOKIE_COLLECTION_ADDRESS,
        metadataName: metadataAccount.name.toString()
      });

      // More robust Pookie verification:
      // 1. Check collection address OR
      // 2. Check if name contains "Pookie" OR
      // 3. Check for creator address match if creator is defined
      const isPookieByCollection = collectionKey === POOKIE_COLLECTION_ADDRESS;
      const isPookieByName = metadataAccount.name.toString().toLowerCase().includes('pookie');
      
      // Check creators if available
      let isPookieByCreator = false;
      // Access creators from the extended metadata account or from metadata JSON
      const extendedMetadata = metadataAccount as ExtendedMetadata;
      const metadataCreators = metadata?.creators || extendedMetadata.creators || [];
      
      if (metadataCreators.length > 0) {
        // Add your known creator addresses here if needed
        const pookieCreators = [
          // Add creator wallet addresses if known
          POOKIE_COLLECTION_ADDRESS, // Using collection address as fallback
        ];
        
        isPookieByCreator = metadataCreators.some(
          (creator: any) => pookieCreators.includes(creator.address?.toString())
        );
      }
      
      const isPookieNFT = isPookieByCollection || isPookieByName || isPookieByCreator;
      
      if (!isPookieNFT) {
        console.log(`Skipping non-Pookie NFT: ${mintAddress}, name: ${metadataAccount.name.toString()}, collection: ${collectionKey}`);
        return null;
      }

      console.log('Valid Pookie NFT found:', mintAddress);

      // Construct NFT object with verified data
      const nft: NFT = {
        mint: mintAddress,
        name: metadata.name || metadataAccount.name.toString(),
        symbol: metadata.symbol || metadataAccount.symbol.toString() || '',
        image: metadata.image || '/images/pookie-smashin.gif', // Fallback to placeholder
        attributes: metadata.attributes || [],
        collectionAddress: collectionKey || POOKIE_COLLECTION_ADDRESS // Use actual collection if available
      };

      // Validate image URL
      if (nft.image && !nft.image.startsWith('/')) {
        try {
          console.log('Validating image URL:', nft.image);
          await axios.head(nft.image);
        } catch (error) {
          console.warn(`Invalid image URL for ${mintAddress}, using fallback`);
          nft.image = '/images/pookie-smashin.gif';
        }
      }

      return nft;

    } catch (uriError) {
      console.error(`Error fetching metadata URI for ${mintAddress}:`, uriError);
      // Even if URI fetch fails, still consider it a Pookie NFT if we have signs it is
      const isPookieByName = metadataAccount.name.toString().toLowerCase().includes('pookie');
      const isPookieByCollection = metadataAccount.collection?.key.toString() === POOKIE_COLLECTION_ADDRESS;
      
      if (isPookieByName || isPookieByCollection) {
        // Return basic metadata if URI fetch fails but it's still a Pookie NFT
        return {
          mint: mintAddress,
          name: metadataAccount.name.toString() || `Pookie #${mintAddress.slice(0, 6)}`,
          image: '/images/pookie-smashin.gif', // Fallback image
          symbol: metadataAccount.symbol.toString() || '',
          collectionAddress: POOKIE_COLLECTION_ADDRESS
        };
      }
      return null;
    }

  } catch (error) {
    console.error(`Error parsing NFT metadata for ${mintAddress}:`, error);
    return null;
  }
}

/**
 * Fetch NFTs owned by a wallet using Solana RPC with retry logic
 */
export async function fetchNFTsForWallet(walletAddress: string): Promise<NFT[]> {
  console.log('Starting NFT fetch for wallet:', walletAddress);
  
  // Use the shared connection
  const connection = getConnection();
  const endpoint = connection.rpcEndpoint;
  console.log('Using endpoint for fetchNFTsForWallet:', endpoint);
  
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1500; // Slightly increased delay
  
  const fetchWithRetry = async (fn: () => Promise<any>, retries = 0): Promise<any> => {
    try {
      return await fn();
    } catch (error: any) {
      console.log('Fetch retry error:', error.message, 'Attempt:', retries + 1);
      if ((error.message?.includes('429') || error.message?.includes('rate limit')) && retries < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, retries)));
        return fetchWithRetry(fn, retries + 1);
      }
      throw error;
    }
  };
  
  try {
    const pubKey = new PublicKey(walletAddress);
    console.log('Fetching token accounts for wallet...');
    
    // Fetch token accounts with retry
    const tokenAccounts = await fetchWithRetry(() => 
      connection.getParsedTokenAccountsByOwner(
        pubKey,
        { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
      )
    );
    
    console.log('Total token accounts found:', tokenAccounts.value.length);
    
    // Filter for NFTs (amount = 1)
    const nftAccounts = tokenAccounts.value.filter((tokenAccount: TokenAccount) => {
      const amount = tokenAccount.account.data.parsed.info.tokenAmount;
      return amount.uiAmount === 1 && amount.decimals === 0;
    });
    
    console.log('NFT accounts found:', nftAccounts.length);
    
    // Process NFTs in parallel with rate limiting
    const nfts: NFT[] = [];
    const batchSize = 2; // Reduced batch size to avoid rate limits
    
    for (let i = 0; i < nftAccounts.length; i += batchSize) {
      console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(nftAccounts.length / batchSize)}`);
      const batch = nftAccounts.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (tokenAccount: TokenAccount) => {
        const mint = tokenAccount.account.data.parsed.info.mint;
        console.log('Processing NFT mint:', mint);
        try {
          return await fetchWithRetry(() => parseNFTMetadata(mint));
        } catch (error) {
          console.error(`Error processing NFT ${mint}:`, error);
          return null;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      const validNfts = batchResults.filter(Boolean) as NFT[];
      console.log(`Batch complete. Valid NFTs found in batch: ${validNfts.length}`);
      nfts.push(...validNfts);
      
      // Add small delay between batches to avoid rate limits
      if (i + batchSize < nftAccounts.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log('Total valid Pookie NFTs found:', nfts.length);
    return nfts;
    
  } catch (error) {
    console.error(`Error in fetchNFTsForWallet using ${endpoint}:`, error);
    // If we encounter a fatal error, attempt to return any NFTs we've found so far
    return [];
  }
}

/**
 * Verify NFT ownership
 */
export async function verifyNFTOwnership(walletAddress: string, nftMint: string): Promise<boolean> {
  try {
    // Use the shared connection
    const connection = getConnection();
    console.log('Using endpoint for verifyNFTOwnership:', connection.rpcEndpoint);
    
    const walletPubKey = new PublicKey(walletAddress);
    const mintPubKey = new PublicKey(nftMint);
    
    // Get all token accounts owned by the wallet for this mint
    const tokenAccounts = await connection.getTokenAccountsByOwner(
      walletPubKey,
      { mint: mintPubKey }
    );
    
    // Check if any token account has a balance of 1
    for (const { account } of tokenAccounts.value) {
      const accountInfo = account;
      // The balance is stored in the last 8 bytes of the account data
      const balance = accountInfo.data.readBigUInt64LE(accountInfo.data.length - 8);
      
      if (balance === BigInt(1)) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error verifying NFT ownership:', error)
    return false
  }
}

/**
 * Fetch metadata for a specific NFT
 */
export async function fetchNFTMetadata(nftMint: string): Promise<NFT | null> {
  try {
    // Use the shared connection
    const connection = getConnection();
    console.log('Using endpoint for fetchNFTMetadata:', connection.rpcEndpoint);
    
    return await parseNFTMetadata(nftMint);
    
  } catch (error) {
    console.error('Error fetching NFT metadata:', error)
    return null
  }
} 