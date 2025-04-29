import { Connection, PublicKey } from '@solana/web3.js'
import axios from 'axios'

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
 * Get NFT metadata from account data
 */
async function parseNFTMetadata(connection: Connection, mintAddress: string): Promise<NFT | null> {
  try {
    // Get the metadata PDA for the NFT mint
    const metadataPDA = await getMetadataPDA(mintAddress);
    
    // Fetch the metadata account info from the connection
    const accountInfo = await connection.getAccountInfo(new PublicKey(metadataPDA));
    
    if (!accountInfo) {
      return null;
    }
    
    // Skip the metadata account discriminator (first 8 bytes)
    // and parse the JSON URI from the account data
    // This is a simplified approach - in production, you'd use proper deserialization
    
    // Try to extract the URI from the data
    const dataStr = new TextDecoder().decode(accountInfo.data);
    const uriMatch = dataStr.match(/(https?:\/\/[^"]+)/);
    
    if (uriMatch && uriMatch[0]) {
      try {
        // Fetch JSON metadata from the URI
        const response = await axios.get(uriMatch[0]);
        const metadata = response.data;
        
        return {
          mint: mintAddress,
          name: metadata.name || `NFT #${mintAddress.slice(0, 6)}`,
          image: metadata.image || '/images/pookie-smashin.gif',
          symbol: metadata.symbol || '',
          attributes: metadata.attributes || [],
          collectionAddress: POOKIE_COLLECTION_ADDRESS
        };
      } catch (error) {
        console.error('Error fetching metadata from URI:', error);
      }
    }
    
    // Fallback if URI fetch failed
    return {
      mint: mintAddress,
      name: `NFT #${mintAddress.slice(0, 6)}`,
      image: '/images/pookie-smashin.gif',
      collectionAddress: POOKIE_COLLECTION_ADDRESS
    };
  } catch (error) {
    console.error('Error parsing NFT metadata:', error);
    return null;
  }
}

/**
 * Get the Metadata PDA for a mint address
 */
async function getMetadataPDA(mintAddress: string): Promise<string> {
  const METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
  
  const seeds = [
    Buffer.from('metadata'),
    new PublicKey(METADATA_PROGRAM_ID).toBuffer(),
    new PublicKey(mintAddress).toBuffer(),
  ];
  
  const [pda] = PublicKey.findProgramAddressSync(seeds, new PublicKey(METADATA_PROGRAM_ID));
  return pda.toString();
}

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