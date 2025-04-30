import { Connection, PublicKey, AccountInfo } from '@solana/web3.js'
import axios from 'axios'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { fetchMetadata, mplTokenMetadata, TokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { fromWeb3JsPublicKey, toWeb3JsPublicKey } from '@metaplex-foundation/umi-web3js-adapters'
import type { Umi } from '@metaplex-foundation/umi'

// The collection address for Pookie NFTs
export const POOKIE_COLLECTION_ADDRESS = 'a3a46b3ef956082d30f9483c9f4e23733343eb8bc1de331c3c1072959b76ea4d';

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
 * Get NFT metadata from account data using more robust approach
 */
async function parseNFTMetadata(mintAddress: string): Promise<NFT | null> {
  console.log(`Starting metadata parse for mint: ${mintAddress}`);
  try {
    // Get the connection
    const connection = getConnection();
    
    // Get the metadata account address
    const metadataPDA = await getMetadataPDA(mintAddress);
    console.log(`Metadata PDA for ${mintAddress}: ${metadataPDA.toString()}`);
    
    // Fetch metadata account data directly from RPC
    const accountInfo = await connection.getAccountInfo(metadataPDA);
    if (!accountInfo) {
      console.warn(`No metadata account found for mint: ${mintAddress}`);
      return null;
    }
    
    // If we got this far, we have an NFT with metadata
    let collectionAddress = null;
    
    // Try to parse metadata with UMI
    try {
      const umi = getUmi();
      // Convert the metadata PDA to UMI public key format, not the mint
      const metadataPDAUmi = fromWeb3JsPublicKey(metadataPDA);
      const metadataAccount = await fetchMetadata(umi, metadataPDAUmi) as ExtendedMetadata;
      
      // Add error handling for undefined metadata
      if (!metadataAccount) {
        console.log(`No metadata found for ${mintAddress} at PDA ${metadataPDA.toString()}`);
        return null;
      }
      
      // Check if it's in the Pookie collection - with null checks
      collectionAddress = metadataAccount.collection?.key?.toString() || null;
      
      // Primary check - by collection address
      let isPookieNFT = collectionAddress === POOKIE_COLLECTION_ADDRESS;
      
      // Fallback check - if collection is null, try to identify by name or creators
      if (!isPookieNFT) {
        const name = metadataAccount.name.toString().toLowerCase();
        const symbol = metadataAccount.symbol.toString().toLowerCase();
        
        console.log(`NFT name check: "${name}", symbol: "${symbol}" for ${mintAddress}`);
        
        // Check if name or symbol contains "pookie" with more variations
        const namePookieCheck = name.includes("pookie") || 
                               name.includes("pook ") || 
                               name.includes("pook#") || 
                               name.startsWith("pook") ||
                               !!name.match(/pook\s*#\d+/); // Convert to boolean with !!
                               
        const symbolPookieCheck = symbol === "pookie" || 
                                 symbol === "pook" || 
                                 symbol.includes("pook");
        
        // Check creators if they exist - ACTUAL Pookie creator addresses
        let creatorPookieCheck = false;
        if (metadataAccount.creators && metadataAccount.creators.length > 0) {
          // Real Pookie creator addresses
          const knownPookieCreators = [
            "ASky6aQmJxKn3cd1D7z6qoXnfV4EoWwe2RT1kM7BDWCQ", // Pookie Collection Address
            "9s9i1WBU14UNx6a3tK1rhcJ3fCq4MnVTYUJAq6L3HzFH", // Known Pookie creator
            "HFuhNX69bH7BJ9wh4mGqzKRqFJWAufnDw3r1pVhTPGN1" // Additional Pookie creator
          ];
          
          for (const creator of metadataAccount.creators) {
            const creatorAddress = creator.address.toString();
            console.log(`Checking creator: ${creatorAddress} for ${mintAddress}`);
            if (knownPookieCreators.includes(creatorAddress)) {
              creatorPookieCheck = true;
              break;
            }
          }
        }
        
        // Combine all checks
        isPookieNFT = namePookieCheck || symbolPookieCheck || creatorPookieCheck;
        
        if (isPookieNFT) {
          console.log(`Found Pookie NFT by secondary check: ${mintAddress}, name: ${name}, symbol: ${symbol}`);
        }
      }
      
      if (!isPookieNFT) {
        console.log(`Not a Pookie NFT: ${mintAddress}, collection: ${collectionAddress}`);
        return null;
      }
      
      // Clean the URI to get the JSON metadata
      const uri = metadataAccount.uri.toString().replace(/\0/g, '').trim();
      console.log(`Metadata URI for ${mintAddress}: ${uri}`);
      
      try {
        // Fetch metadata from URI
        const response = await axios.get(uri, { timeout: 5000 });
        const metadata = response.data;
        
        return {
          mint: mintAddress,
          name: metadata.name || metadataAccount.name.toString(),
          symbol: metadata.symbol || metadataAccount.symbol.toString() || '',
          image: metadata.image || '/images/pookie-smashin.gif', // Fallback image
          attributes: metadata.attributes || [],
          collectionAddress
        };
      } catch (uriError) {
        console.error(`Error fetching URI for ${mintAddress}:`, uriError);
        // Return basic metadata if we can't fetch the URI
        return {
          mint: mintAddress,
          name: metadataAccount.name.toString() || `Pookie #${mintAddress.slice(0, 6)}`,
          image: '/images/pookie-smashin.gif', // Fallback image
          symbol: metadataAccount.symbol.toString() || '',
          collectionAddress
        };
      }
    } catch (umiError) {
      console.error(`Error using UMI for ${mintAddress}:`, umiError);
      
      // Don't assume it's a Pookie NFT if we can't verify
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