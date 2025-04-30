import { Connection, PublicKey } from '@solana/web3.js'
import axios from 'axios'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { fetchMetadata, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { fromWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import type { Umi } from '@metaplex-foundation/umi'

// The collection address for Pookie NFTs
export const POOKIE_COLLECTION_ADDRESS = process.env.NEXT_PUBLIC_POOKIE_COLLECTION_ADDRESS || 'ASky6aQmJxKn3cd1D7z6qoXnfV4EoWwe2RT1kM7BDWCQ'

// Use a more reliable RPC endpoint for production
const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

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

/**
 * Get NFT metadata from account data using Umi
 */
async function parseNFTMetadata(connection: Connection, mintAddress: string): Promise<NFT | null> {
  console.log(`Starting metadata parse for mint: ${mintAddress}`);
  try {
    // Create Umi instance with token metadata plugin
    const baseUmi = createUmi(connection.rpcEndpoint);
    const plugin = mplTokenMetadata();
    plugin.install(baseUmi);
    const umi = baseUmi;

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

      // Verify collection with detailed logging
      const collectionKey = metadataAccount.collection?.key.toString();
      console.log('Collection verification:', {
        nftMint: mintAddress,
        collectionKey,
        expectedCollection: POOKIE_COLLECTION_ADDRESS,
        matches: collectionKey === POOKIE_COLLECTION_ADDRESS
      });

      const isPookieNFT = collectionKey === POOKIE_COLLECTION_ADDRESS;
      
      if (!isPookieNFT) {
        console.log(`Skipping non-Pookie NFT: ${mintAddress}, collection: ${collectionKey}`);
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
        collectionAddress: POOKIE_COLLECTION_ADDRESS
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
      // Return basic metadata if URI fetch fails
      return {
        mint: mintAddress,
        name: metadataAccount.name.toString() || `Pookie #${mintAddress.slice(0, 6)}`,
        image: '/images/pookie-smashin.gif', // Fallback image
        symbol: metadataAccount.symbol.toString() || '',
        collectionAddress: POOKIE_COLLECTION_ADDRESS
      };
    }

  } catch (error) {
    console.error(`Error parsing NFT metadata for ${mintAddress}:`, error);
    return null;
  }
}

/**
 * Get the Metadata PDA for a mint address (No longer needed with Umi's fetchMetadata)
 */
// async function getMetadataPDA(mintAddress: string): Promise<string> { ... } // Removed

/**
 * Fetch NFTs owned by a wallet using Solana RPC with retry logic
 */
export async function fetchNFTsForWallet(walletAddress: string): Promise<NFT[]> {
  console.log('Starting NFT fetch for wallet:', walletAddress);
  
  const connection = new Connection(SOLANA_RPC_URL, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  });
  
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000;
  
  const fetchWithRetry = async (fn: () => Promise<any>, retries = 0): Promise<any> => {
    try {
      return await fn();
    } catch (error: any) {
      console.log('Fetch retry error:', error.message, 'Attempt:', retries + 1);
      if (error.message?.includes('429') && retries < MAX_RETRIES) {
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
        return await fetchWithRetry(() => parseNFTMetadata(connection, mint));
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
    console.error('Error in fetchNFTsForWallet:', error);
    throw error;
  }
}

/**
 * Verify NFT ownership
 */
export async function verifyNFTOwnership(walletAddress: string, nftMint: string): Promise<boolean> {
  try {
    // Connect to Solana
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
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
    // Connect to Solana
    const connection = new Connection(SOLANA_RPC_URL, 'confirmed')
    
    return await parseNFTMetadata(connection, nftMint);
    
  } catch (error) {
    console.error('Error fetching NFT metadata:', error)
    return null
  }
} 