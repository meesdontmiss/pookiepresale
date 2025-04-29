import { Connection, PublicKey } from '@solana/web3.js'
import axios from 'axios'
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { fetchMetadata, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { publicKey as umiPublicKey } from '@metaplex-foundation/umi'
import { createWeb3JsRpc } from '@metaplex-foundation/umi-rpc-web3js'

// The collection address for Pookie NFTs
export const POOKIE_COLLECTION_ADDRESS = process.env.NEXT_PUBLIC_POOKIE_COLLECTION_ADDRESS || 'ASky6aQmJxKn3cd1D7z6qoXnfV4EoWwe2RT1kM7BDWCQ'

// Solana RPC URL - Use public endpoint
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

/**
 * Get NFT metadata from account data using Umi
 */
async function parseNFTMetadata(connection: Connection, mintAddress: string): Promise<NFT | null> {
  try {
    // Create a Umi instance
    const umi = createUmi(connection.rpcEndpoint)
      .use(mplTokenMetadata())
      // Use createWeb3JsRpc wrapper to allow passing the web3.js Connection object
      .use({
        install(umi) {
          umi.rpc = createWeb3JsRpc(umi, connection);
        },
      });

    // Fetch metadata using Umi
    const metadataAccount = await fetchMetadata(umi, umiPublicKey(mintAddress))

    if (!metadataAccount) {
      console.warn(`No metadata account found for mint: ${mintAddress}`);
      return null;
    }

    // --- Metadata URI is now correctly fetched via metadataAccount.uri ---
    // --- We will fetch the content via a backend proxy later ---

    // For now, return the basic info + URI (will be replaced by proxy data later)
    // Clean the URI: Remove null terminators often found in on-chain URIs
    const cleanedUri = metadataAccount.uri.replace(/\\u0000/g, '');

    return {
      mint: mintAddress,
      // Use on-chain name and symbol if available
      name: metadataAccount.name || `NFT #${mintAddress.slice(0, 6)}`,
      symbol: metadataAccount.symbol || '',
      // Store the URI, we'll fetch content via proxy later
      image: cleanedUri, // Placeholder: Use URI for now, will be replaced by actual image from proxy
      attributes: [], // Placeholder: Will be populated by proxy fetch
      collectionAddress: POOKIE_COLLECTION_ADDRESS // Assuming collection check happens later
    };

  } catch (error) {
    console.error(`Error parsing NFT metadata for ${mintAddress}:`, error);
    // Fallback for errors during parsing
    return {
      mint: mintAddress,
      name: `NFT #${mintAddress.slice(0, 6)}`,
      image: '/images/pookie-smashin.gif', // Default image on error
      collectionAddress: POOKIE_COLLECTION_ADDRESS
    };
  }
}

/**
 * Get the Metadata PDA for a mint address (No longer needed with Umi's fetchMetadata)
 */
// async function getMetadataPDA(mintAddress: string): Promise<string> { ... } // Removed

/**
 * Fetch NFTs owned by a wallet using Solana RPC
 */
export async function fetchNFTsForWallet(walletAddress: string): Promise<NFT[]> {
  // Connect to Solana
  const connection = new Connection(SOLANA_RPC_URL, 'confirmed')
  
  try {
    // Check if wallet is valid
    const pubKey = new PublicKey(walletAddress)
    
    // Use getParsedTokenAccountsByOwner to get all token accounts 
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      pubKey,
      { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
    );
    
    // Filter for NFTs (amount = 1)
    const nftAccounts = tokenAccounts.value.filter(tokenAccount => {
      const amount = tokenAccount.account.data.parsed.info.tokenAmount;
      return amount.uiAmount === 1 && amount.decimals === 0;
    });
    
    // Process NFTs in parallel with a limit to avoid rate limiting
    const nfts: NFT[] = [];
    const batchSize = 5;
    
    for (let i = 0; i < nftAccounts.length; i += batchSize) {
      const batch = nftAccounts.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (tokenAccount) => {
        const mint = tokenAccount.account.data.parsed.info.mint;
        const metadata = await parseNFTMetadata(connection, mint);
        
        if (metadata) {
          return metadata;
        }
        return null;
      });
      
      const batchResults = await Promise.all(batchPromises);
      nfts.push(...batchResults.filter(Boolean) as NFT[]);
      
      // Small delay to avoid rate limiting
      if (i + batchSize < nftAccounts.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Filter for Pookie collection NFTs if collection address is specified
    const filteredNfts = POOKIE_COLLECTION_ADDRESS 
      ? nfts.filter(nft => nft.collectionAddress === POOKIE_COLLECTION_ADDRESS)
      : nfts;
      
    return filteredNfts;
    
  } catch (error) {
    console.error('Error fetching NFTs:', error)
    return []
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