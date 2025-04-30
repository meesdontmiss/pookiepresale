import { Connection, PublicKey, AccountInfo } from '@solana/web3.js'
import axios from 'axios'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { fetchMetadata, mplTokenMetadata, TokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { fromWeb3JsPublicKey, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import type { Umi } from '@metaplex-foundation/umi'

// The collection address for Pookie NFTs
export const POOKIE_COLLECTION_ADDRESS = process.env.NEXT_PUBLIC_POOKIE_COLLECTION_ADDRESS || 'a3a46b3ef956082d30f9483c9f4e23733343eb8bc1de331c3c1072959b76ea4d'

// Token metadata program ID
export const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

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
  // Fallback for potential server-side usage
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
  pookieNumber?: string | null
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
  creators?: Array<{
    address: { toString: () => string };
    verified: boolean;
    share: number;
  }>;
}

// Get metadata PDA address from mint
async function getMetadataPDA(mintAddress: string): Promise<PublicKey> {
  try {
    // Manual calculation of metadata PDA
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        TOKEN_METADATA_PROGRAM_ID.toBuffer(),
        new PublicKey(mintAddress).toBuffer(),
      ],
      TOKEN_METADATA_PROGRAM_ID
    );
    
    return pda;
  } catch (error) {
    console.error(`Error getting metadata PDA for ${mintAddress}:`, error);
    throw error;
  }
}

/**
 * Parse the metadata for an NFT
 */
async function parseNFTMetadata(mintAddress: string): Promise<NFT | null> {
  try {
    // Use shared UMI instance
    const umi = getUmi()
    
    try {
      // Convert mint to UMI format
      const mintPubKey = fromWeb3JsPublicKey(new PublicKey(mintAddress))
      
      // Fetch on-chain metadata
      const metadataAccount = await fetchMetadata(umi, mintPubKey)
      
      // Extract collection information to check if it's a Pookie NFT
      const collectionAddress = metadataAccount.collection?.key.toString() || null
      
      // Verify collection address matches Pookie
      if (collectionAddress !== POOKIE_COLLECTION_ADDRESS) {
        console.log(`NFT ${mintAddress} is not from Pookie collection. Found: ${collectionAddress}`)
        return null
      }
      
      // Extract NFT number from name for better image matching
      const metadataName = metadataAccount.name.toString().replace(/\0/g, '').trim()
      const nameMatch = metadataName.match(/Pookie #(\d+)/i)
      const pookieNumber = nameMatch ? nameMatch[1] : null
      
      // Get metadata URI
      const uri = metadataAccount.uri.toString().replace(/\0/g, '').trim()
      
      // Normalize arweave URLs
      let normalizedUri = uri
      if (uri.includes('arweave.net')) {
        normalizedUri = uri.replace('https://www.arweave.net/', 'https://arweave.net/')
      }
      
      try {
        // Try to fetch NFT metadata from URI
        const response = await axios.get(normalizedUri, { 
          timeout: 5000,
          headers: { 'Accept': 'application/json' }  
        })
        
        const metadata = response.data
        
        // Extract and normalize the image URL
        let imageUrl = metadata.image || ''
        
        // Check for alternate image locations in metadata
        if (!imageUrl && metadata.properties?.files?.length > 0) {
          // Check files array for image
          for (const file of metadata.properties.files) {
            if (typeof file === 'object' && file.uri && (
                file.type === 'image/png' || 
                file.type === 'image/jpeg' || 
                file.type === 'image/gif' || 
                file.uri.endsWith('.png') || 
                file.uri.endsWith('.jpg') || 
                file.uri.endsWith('.jpeg') || 
                file.uri.endsWith('.gif')
            )) {
              imageUrl = file.uri
              break
            } else if (typeof file === 'string' && (
                file.endsWith('.png') || 
                file.endsWith('.jpg') || 
                file.endsWith('.jpeg') || 
                file.endsWith('.gif')
            )) {
              imageUrl = file
              break
            }
          }
        }
        
        // If no image found but we have the Pookie number, use known format
        if ((!imageUrl || imageUrl.length === 0) && pookieNumber) {
          imageUrl = `https://arweave.net/DuHCK6NWnzZKUfNbTDvLMnkXKsZbD6iOaG3DDkXj3rs/${pookieNumber}.png`
          console.log(`Using derived image URL for Pookie #${pookieNumber}: ${imageUrl}`)
        }
        
        // Normalize arweave URLs in image too
        if (imageUrl && imageUrl.includes('arweave.net')) {
          imageUrl = imageUrl.replace('https://www.arweave.net/', 'https://arweave.net/')
        }
        
        // Check if imageUrl is just an Arweave transaction ID
        if (imageUrl && /^[a-zA-Z0-9_-]{43}$/.test(imageUrl)) {
          imageUrl = `https://arweave.net/${imageUrl}`
          console.log(`Normalized URL to: ${imageUrl}`)
        }
        
        console.log(`Final image URL: ${imageUrl} for ${mintAddress}`)
        
        // Save with direct image URL if available in other properties
        const directImageUrl = metadata.image_url || metadata.imageUrl || 
                               metadata.image_uri || metadata.imageUri || 
                               metadata.uri || metadata.url || imageUrl
        
        // Add pookieNumber to NFT data for easier reference
        return {
          mint: mintAddress,
          name: metadata.name || metadataName,
          symbol: metadata.symbol || metadataAccount.symbol.toString().replace(/\0/g, '').trim() || '',
          image: directImageUrl,
          attributes: metadata.attributes || [],
          collectionAddress,
          pookieNumber: pookieNumber
        }
      } catch (uriError) {
        console.error(`Error fetching URI for ${mintAddress}:`, uriError)
        
        // Create fallback data using on-chain info and pookieNumber if available
        let fallbackImage = 'https://arweave.net/DuHCK6NWnzZKUfNbTDvLMnkXKsZbD6iOaG3DDkXj3rs'
        
        // If we have a Pookie number, construct direct image URL
        if (pookieNumber) {
          fallbackImage = `https://arweave.net/DuHCK6NWnzZKUfNbTDvLMnkXKsZbD6iOaG3DDkXj3rs/${pookieNumber}.png`
        }
        
        // Return basic metadata with fallback image
        return {
          mint: mintAddress,
          name: metadataName,
          image: fallbackImage,
          symbol: metadataAccount.symbol.toString().replace(/\0/g, '').trim() || '',
          collectionAddress,
          pookieNumber: pookieNumber
        }
      }
    } catch (umiError) {
      console.error(`Error using UMI for ${mintAddress}:`, umiError)
      return null
    }
  } catch (error) {
    console.error(`Error parsing NFT metadata for ${mintAddress}:`, error)
    return null
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
  const RETRY_DELAY = 1500;
  // Add error tracking to prevent wasting API credits
  const MAX_CONSECUTIVE_ERRORS = 5;
  let consecutiveErrors = 0;
  
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
      // Exit early if too many consecutive errors to prevent endless API calls
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.warn(`Too many consecutive errors (${consecutiveErrors}), stopping NFT fetch to prevent API waste`);
        break;
      }

      console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(nftAccounts.length / batchSize)}`);
      const batch = nftAccounts.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (tokenAccount: TokenAccount) => {
        const mint = tokenAccount.account.data.parsed.info.mint;
        console.log('Processing NFT mint:', mint);
        try {
          const result = await fetchWithRetry(() => parseNFTMetadata(mint));
          if (result) {
            consecutiveErrors = 0; // Reset error counter on success
            return result;
          } else {
            consecutiveErrors++; // Increment error counter for null results
            return null;
          }
        } catch (error) {
          console.error(`Error processing NFT ${mint}:`, error);
          consecutiveErrors++; // Increment error counter on error
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