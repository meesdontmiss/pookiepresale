"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { PublicKey, Transaction } from '@solana/web3.js'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { playSound } from '@/hooks/use-audio'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsContent, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchNFTsForWallet, NFT as BaseNFT } from '@/utils/solana-nft'
import { ChevronRightIcon, ChevronLeftIcon, ClockIcon, CoinsIcon, RefreshCwIcon, AlertTriangleIcon, WalletIcon } from 'lucide-react'
import { 
  createStakeNftTransaction, 
  createUnstakeNftTransaction, 
  createClaimRewardsTransaction,
  getStakingInfo,
  isNftStaked,
  sendTransaction,
  getTokenBalance,
  hasEnoughSol,
  StakingError
} from '@/utils/solana-staking-client'
import { ErrorBoundary } from 'react-error-boundary'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import axios from 'axios'

// Sound paths
const CLICK_SOUND_PATH = '/sounds/click-sound.wav'
const SUCCESS_SOUND_PATH = '/sounds/success-sound.wav'
const ERROR_SOUND_PATH = '/sounds/error-sound.wav'

// Extend BaseNFT to include full metadata fetched via proxy
interface NFT extends BaseNFT {
  metadataFetched?: boolean; // Flag to check if full metadata is loaded
  // Add other potential fields from metadata JSON if needed
  description?: string;
  pookieNumber?: string; // The NFT number extracted from name or metadata
}

// NFT staking interface with additional staking data
interface StakedNFT extends NFT {
  isStaked: boolean
  stakedAt?: number
  daysStaked?: number
  currentReward?: number
}

// Error Fallback component for error boundary
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error, resetErrorBoundary: () => void }) => (
  <div className="p-6 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
    <h3 className="text-lg font-medium text-red-800 dark:text-red-200">Something went wrong:</h3>
    <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error.message}</p>
    <button
      onClick={resetErrorBoundary}
      className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 dark:bg-red-800 dark:hover:bg-red-700 text-red-700 dark:text-red-200 rounded-md transition-colors"
    >
      Try again
    </button>
  </div>
)

export default function OnChainNftStaking() {
  const { connection } = useConnection()
  const { connected, publicKey, connecting, disconnect } = useWallet()
  const [walletNfts, setWalletNfts] = useState<StakedNFT[]>([])
  const [stakedNfts, setStakedNfts] = useState<StakedNFT[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [initialLoading, setInitialLoading] = useState<boolean>(true)
  const [totalRewards, setTotalRewards] = useState<number>(0)
  const [activeTab, setActiveTab] = useState<string>("wallet")
  const [stakingInProgress, setStakingInProgress] = useState<boolean>(false)
  const [unstakingInProgress, setUnstakingInProgress] = useState<boolean>(false)
  const [claimingInProgress, setClaimingInProgress] = useState<boolean>(false)
  const [selectedNftMint, setSelectedNftMint] = useState<string>("")
  const [hasSufficientBalance, setHasSufficientBalance] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0)
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({})
  const [metadataLoading, setMetadataLoading] = useState<Record<string, boolean>>({})
  
  const refreshTimer = useRef<NodeJS.Timeout | null>(null)
  const connectedRef = useRef<boolean>(false)
  const isFetchingRef = useRef<boolean>(false); // Ref to track if fetch is in progress

  // Wrap fetchWalletData in useCallback
  const fetchWalletData = useCallback(async () => {
    // Prevent overlapping fetches
    if (isFetchingRef.current) {
      console.log("Fetch already in progress, skipping.");
      return;
    }
    if (!publicKey || !connection) return
    
    isFetchingRef.current = true; // Set fetching flag
    console.log("Fetching wallet data for publicKey:", publicKey.toString());
    setError(null)
    setInitialLoading(true)
    setMetadataLoading({});
    try {
      // Fetch base NFT data (mint, name, symbol, uri in image field)
      const walletAddress = publicKey.toString()
      console.log("Attempting to fetch NFTs for wallet:", walletAddress);
      
      // Set a timeout to show a message if fetching takes too long
      const timeoutId = setTimeout(() => {
        toast({
          title: "Taking a while to load NFTs",
          description: "The Solana network might be experiencing high traffic. Please wait...",
          duration: 5000,
        });
      }, 8000);
      
      // Pass wallet address only - no need to create new connections
      const baseNfts = await fetchNFTsForWallet(walletAddress)
      clearTimeout(timeoutId);
      
      console.log("Base NFTs fetched (URI in image field):", baseNfts);

      if (baseNfts.length === 0) {
        console.log("No base NFTs found for this wallet.");
        setWalletNfts([])
        setStakedNfts([])
        setTotalRewards(0)
        setError("No Pookie NFTs found in this wallet. If you believe this is an error, please try refreshing.");
        return // Early return is okay, finally will still run
      }
      
      // Check staking status for each NFT with better error handling
      const nftsWithStakingStatusPromises = baseNfts.map(async (nft) => {
        try {
          // Use the existing connection from useConnection hook
          const stakingInfo = await getStakingInfo(
            connection, 
            publicKey,
            new PublicKey(nft.mint)
          )
          
          return {
            ...nft,
            isStaked: stakingInfo.isStaked,
            stakedAt: stakingInfo.stakedAt,
            daysStaked: stakingInfo.daysStaked,
            currentReward: stakingInfo.currentReward,
            metadataFetched: false, // Mark as not fetched yet
          }
        } catch (error) {
          console.error(`Error getting staking info for ${nft.mint}:`, error)
          // Add mint to error object if possible
          if (error instanceof Error) {
             (error as any).mint = nft.mint; 
          }
          // Don't propagate the error, just return the NFT without staking info
          return {
            ...nft,
            isStaked: false,
            metadataFetched: false,
            // Add flag to indicate staking info fetch failed
            stakingInfoError: true
          }
        }
      });
      
      // Use Promise.allSettled to handle partial failures
      const stakingResults = await Promise.allSettled(nftsWithStakingStatusPromises);
      const nftsWithStakingStatus: StakedNFT[] = stakingResults
        .filter(result => result.status === 'fulfilled')
        .map(result => (result as PromiseFulfilledResult<StakedNFT>).value);
      
      // Log any rejected promises
      const rejectedResults = stakingResults.filter(result => result.status === 'rejected');
      if (rejectedResults.length > 0) {
        console.error(`${rejectedResults.length} NFTs failed to get staking status:`, 
          rejectedResults.map(result => (result as PromiseRejectedResult).reason)
        );
      }
      
      console.log("NFTs with staking status (pre-metadata fetch):", nftsWithStakingStatus);

      // Separate staked and unstaked NFTs *before* full metadata fetch
      let stakedBase: StakedNFT[] = nftsWithStakingStatus.filter(nft => nft.isStaked)
      let unstakedBase: StakedNFT[] = nftsWithStakingStatus.filter(nft => !nft.isStaked)
      
      // Update state with base data first for quicker initial render
      setWalletNfts(unstakedBase);
      setStakedNfts(stakedBase);
      setTotalRewards(stakedBase.reduce((sum, nft) => sum + (nft.currentReward || 0), 0));

      // Now, fetch full metadata via proxy for all NFTs (staked and unstaked)
      const fetchAndUpdateMetadata = async (nftsToUpdate: StakedNFT[], setStateAction: React.Dispatch<React.SetStateAction<StakedNFT[]>>) => {
         if (nftsToUpdate.length === 0) return;
         
         // Create a stable copy of the current state to update from
         let currentNfts = [...nftsToUpdate]; 
         
         // Process NFTs in smaller batches to prevent rate limits
         const batchSize = 2;
         for (let i = 0; i < currentNfts.length; i += batchSize) {
           const batch = currentNfts.slice(i, i + batchSize);
           
           // Process this batch
           const updatedBatchPromises = batch.map(async (nft, batchIndex) => {
             try {
               const fullDataNft = await fetchMetadataViaProxy(nft);
               // Update the specific NFT in the copied array
               currentNfts[i + batchIndex] = fullDataNft;
               return fullDataNft;
             } catch (error) {
               console.error(`Error fetching metadata for NFT ${nft.mint}:`, error);
               // Return the original NFT if metadata fetch fails
               return nft;
             }
           });
           
           await Promise.all(updatedBatchPromises);
           // Update state progressively after each batch
           setStateAction([...currentNfts]);
           
           // Small delay between batches
           if (i + batchSize < currentNfts.length) {
             await new Promise(resolve => setTimeout(resolve, 500));
           }
         }
       };

      // Fetch for unstaked and staked NFTs concurrently
      await Promise.all([
        fetchAndUpdateMetadata(unstakedBase, setWalletNfts),
        fetchAndUpdateMetadata(stakedBase, setStakedNfts)
      ]);
      
      console.log("Finished fetching full metadata via proxy.");

    } catch (error) {
      console.error('Error fetching wallet data:', error)
      // Check for specific errors like rate limits
      if (error instanceof Error && (error as any).mint) {
         setError(`Failed to load staking info for ${ (error as any).mint}. Rate limited?`);
      } else if (axios.isAxiosError(error) && error.response?.status === 429) {
        setError("Rate limit exceeded. Please try again in a moment.");
      } else {
        setError("Failed to load NFTs. Please try refreshing.");
      }
      // Still keep any already loaded NFTs
      // (don't reset wallet/staked NFTs here)
    } finally {
      setIsLoading(false)
      setInitialLoading(false)
      isFetchingRef.current = false
    }
  }, [publicKey, connection, toast])

  // Update refs when wallet state changes - Fetch data here
  useEffect(() => {
    if (connected && publicKey) {
      connectedRef.current = true;
      // Don't set initialLoading here, fetchWalletData does it
      checkWalletBalance();
      fetchWalletData(); // Call memoized function
    } else {
      // Handle disconnection
      if (connectedRef.current) {
         connectedRef.current = false;
         setWalletNfts([]);
         setStakedNfts([]);
         setTotalRewards(0);
         setInitialLoading(false); // Reset loading on disconnect
         setError(null);
      }
    }
  // Include fetchWalletData in dependency array as it's memoized
  }, [connected, publicKey, fetchWalletData]); 

  // Removed: useEffect for disconnection logic (merged above)
  // Removed: useEffect for initial load/refresh interval

  // Check if wallet has enough SOL for transactions
  const checkWalletBalance = async () => {
    if (!publicKey) return

    try {
      const hasSol = await hasEnoughSol(connection, publicKey)
      setHasSufficientBalance(hasSol)
      
      if (!hasSol) {
        toast({
          title: "Low Balance Warning",
          description: "Your wallet has insufficient SOL for transactions. Please add more SOL.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error checking wallet balance:', error)
    }
  }

  // Function to fetch full metadata via the backend proxy
  const fetchMetadataViaProxy = async (nft: StakedNFT): Promise<StakedNFT> => {
    if (nft.metadataFetched) return nft;
    
    setMetadataLoading(prev => ({ ...prev, [nft.mint]: true }));
    console.log(`[fetchMetadataViaProxy] Fetching metadata for mint ${nft.mint}`);

    try {
      // Try all three methods to get metadata:
      // 1. Use mint address directly (most reliable)
      // 2. If NFT has a valid image URI, use it
      // 3. Use NFT name to search if both methods above fail
      
      let fullMetadata = null;
      let errors = [];

      // Method 1: Try mint method first (most reliable)
      console.log(`[fetchMetadataViaProxy] Using mint method for ${nft.mint}`);
      try {
        const response = await axios.get(`/api/nft/metadata?mint=${nft.mint}`, {
          timeout: 10000 // 10s timeout
        });
        fullMetadata = response.data;
        console.log(`[fetchMetadataViaProxy] Mint method succeeded for ${nft.mint}`);
      } catch (mintError) {
        console.error(`[fetchMetadataViaProxy] Mint method failed for ${nft.mint}:`, mintError);
        errors.push(mintError);
        // Continue to next method
      }
      
      // Method 2: If mint method failed and NFT has a valid URI, try URI method
      if (!fullMetadata && nft.image && nft.image.startsWith('http')) {
        console.log(`[fetchMetadataViaProxy] Using URI method for ${nft.mint}. URI: ${nft.image}`);
        try {
          const response = await axios.get(`/api/nft/metadata?uri=${encodeURIComponent(nft.image)}`, {
            timeout: 10000 // 10s timeout
          });
          fullMetadata = response.data;
          console.log(`[fetchMetadataViaProxy] URI method succeeded for ${nft.mint}`);
        } catch (uriError) {
          console.error(`[fetchMetadataViaProxy] URI method failed for ${nft.mint}:`, uriError);
          errors.push(uriError);
          // Continue to next method
        }
      }
      
      // Method 3: Name-based search as last resort (only if we have a name)
      if (!fullMetadata && nft.name) {
        console.log(`[fetchMetadataViaProxy] Using name search method for ${nft.name}`);
        try {
          // Extract number from name if it's in the format "Pookie #123"
          const nameMatch = nft.name.match(/Pookie #(\d+)/i);
          const pookieNumber = nameMatch ? nameMatch[1] : null;
          
          if (pookieNumber) {
            // Try a direct fetch with known naming pattern
            const knownMetadataUrl = `https://arweave.net/DuHCK6NWnzZKUfNbTDvLMnkXKsZbD6iOaG3DDkXj3rs/${pookieNumber}.json`;
            const response = await axios.get(`/api/nft/metadata?uri=${encodeURIComponent(knownMetadataUrl)}`, {
              timeout: 10000
            });
            fullMetadata = response.data;
            console.log(`[fetchMetadataViaProxy] Name search method succeeded for ${nft.name}`);
          }
        } catch (nameError) {
          console.error(`[fetchMetadataViaProxy] Name search method failed for ${nft.name}:`, nameError);
          errors.push(nameError);
        }
      }
      
      // Use the fetched metadata to enhance the NFT object
      if (fullMetadata) {
        // Check for pookieNumber in the response or extract from name
        let pookieNumber = fullMetadata.nftNumber || fullMetadata.pookieNumber;
        
        // If not provided directly, extract from name
        if (!pookieNumber && (fullMetadata.name || nft.name)) {
          const name = fullMetadata.name || nft.name;
          const nameMatch = name.match(/Pookie #(\d+)/i);
          pookieNumber = nameMatch ? nameMatch[1] : null;
        }
        
        // Validate image URL if present
        let imageUrl = fullMetadata.image || nft.image || '/images/pookie-smashin.gif';
        
        // Normalize the arweave URL format if needed
        if (imageUrl && imageUrl.includes('arweave.net')) {
          // Fix common issues with arweave URLs
          if (imageUrl.includes('https://www.arweave.net/')) {
            imageUrl = imageUrl.replace('https://www.arweave.net/', 'https://arweave.net/');
          }
          
          // Handle transaction IDs that might be in the URL without proper formatting
          if (imageUrl.match(/arweave\.net\/[a-zA-Z0-9_-]{43}/)) {
            // URL is likely already well-formed
          } else if (imageUrl.match(/^[a-zA-Z0-9_-]{43}$/)) {
            // Just a transaction ID, form the full URL
            imageUrl = `https://arweave.net/${imageUrl}`;
          }
        }
        
        // If we still don't have a valid image but have pookieNumber, try direct path
        if ((!imageUrl || !imageUrl.startsWith('http')) && pookieNumber) {
          imageUrl = `https://arweave.net/DuHCK6NWnzZKUfNbTDvLMnkXKsZbD6iOaG3DDkXj3rs/${pookieNumber}.png`;
          console.log(`Generated image URL from pookieNumber: ${imageUrl}`);
        }
        
        // Ensure image URL is valid and accessible
        try {
          if (imageUrl && imageUrl.startsWith('http')) {
            // Simple validation - just check if URL is accessible
            await axios.head(imageUrl, { timeout: 3000 });
          }
        } catch (imageError) {
          console.warn(`[fetchMetadataViaProxy] Invalid image URL for ${nft.mint}: ${imageUrl}`);
          
          // Try alternate image URL formats if available
          if (fullMetadata.properties?.files?.length > 0) {
            for (const file of fullMetadata.properties.files) {
              if (typeof file === 'string' && file.startsWith('http')) {
                imageUrl = file;
                break;
              } else if (file.uri && file.uri.startsWith('http')) {
                imageUrl = file.uri;
                break;
              }
            }
          }
          
          // If pookieNumber is available, try direct path as last resort
          if (pookieNumber) {
            imageUrl = `https://arweave.net/DuHCK6NWnzZKUfNbTDvLMnkXKsZbD6iOaG3DDkXj3rs/${pookieNumber}.png`;
            console.log(`Falling back to direct pookieNumber path: ${imageUrl}`);
          } else if (!imageUrl || !imageUrl.startsWith('http')) {
            imageUrl = '/images/pookie-smashin.gif';
          }
        }

        return {
          ...nft,
          name: fullMetadata.name || nft.name || `Pookie #${nft.mint.slice(0, 6)}`,
          image: imageUrl,
          description: fullMetadata.description || '',
          attributes: fullMetadata.attributes || [],
          metadataFetched: true,
          pookieNumber: pookieNumber,
        };
      }
      
      // Fallback with what we have
      return {
        ...nft,
        metadataFetched: true,
        // Keep existing values, just mark as fetched
      };
    } catch (error) {
      console.error(`[fetchMetadataViaProxy] Failed to fetch metadata for ${nft.mint}:`, error);
      // Return basic NFT with fallback image
      return { 
        ...nft, 
        name: nft.name || `Pookie #${nft.mint.slice(0, 6)}`,
        image: '/images/pookie-smashin.gif',
        metadataFetched: true 
      };
    } finally {
      setMetadataLoading(prev => ({ ...prev, [nft.mint]: false }));
    }
  };
  
  // Manual Refresh Handler - Uses the memoized fetchWalletData
  const handleRefresh = useCallback(() => {
    if (!connected || !publicKey) {
       toast({ title: "Wallet not connected", variant: "destructive" });
       return;
    }
    console.log("Manual refresh triggered.");
    // Clear existing error message on manual refresh
    setError(null); 
    fetchWalletData(); // Call the memoized function directly
    checkWalletBalance();
   // Removed: setRefreshTrigger(prev => prev + 1); // No longer needed
  }, [connected, publicKey, fetchWalletData]); // Add fetchWalletData dependency

  // Handle NFT staking
  const handleStakeNft = async (nftMint: string) => {
    if (!connected || !publicKey) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to stake NFTs",
        variant: "destructive"
      })
      return
    }
    
    if (!hasSufficientBalance) {
      toast({
        title: "Insufficient SOL",
        description: "Your wallet has insufficient SOL for transaction fees",
        variant: "destructive"
      })
      playSound(ERROR_SOUND_PATH, 0.3)
      return
    }
    
    if (stakingInProgress) return
    
    try {
      setStakingInProgress(true)
      setSelectedNftMint(nftMint)
      playSound(CLICK_SOUND_PATH, 0.3)
      
      // Create stake transaction
      const transaction = await createStakeNftTransaction(
        connection,
        publicKey,
        new PublicKey(nftMint)
      )
      
      // Send transaction
      await sendTransaction(
        transaction, 
        connection, 
        {
          publicKey, 
          signTransaction: async (tx) => {
            if (window.solana && window.solana.signTransaction) {
              return window.solana.signTransaction(tx)
            }
            throw new Error('Wallet adapter does not support signTransaction')
          }
        }
      )
      
      playSound(SUCCESS_SOUND_PATH, 0.3)
      toast({
        title: "NFT Staked!",
        description: "Your NFT has been staked successfully.",
      })
      
      // Refresh data
      await fetchWalletData()
      
      // Switch to staked tab
      setActiveTab('staked')
    } catch (error) {
      console.error('Error staking NFT:', error)
      playSound(ERROR_SOUND_PATH, 0.3)
      
      let errorMessage = "An error occurred while staking your NFT."
      if (error instanceof Error) {
        errorMessage = error.message
      }
      
      toast({
        title: "Staking error",
        description: errorMessage,
        variant: "destructive"
      })
    } finally {
      setStakingInProgress(false)
      setSelectedNftMint("")
    }
  }
  
  // Handle NFT unstaking
  const handleUnstakeNft = async (nftMint: string) => {
    if (!connected || !publicKey) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to unstake NFTs",
        variant: "destructive"
      })
      return
    }
    
    if (!hasSufficientBalance) {
      toast({
        title: "Insufficient SOL",
        description: "Your wallet has insufficient SOL for transaction fees",
        variant: "destructive"
      })
      playSound(ERROR_SOUND_PATH, 0.3)
      return
    }
    
    if (unstakingInProgress) return
    
    try {
      setUnstakingInProgress(true)
      setSelectedNftMint(nftMint)
      playSound(CLICK_SOUND_PATH, 0.3)
      
      // Create unstake transaction
      const transaction = await createUnstakeNftTransaction(
        connection,
        publicKey,
        new PublicKey(nftMint)
      )
      
      // Send transaction
      await sendTransaction(
        transaction, 
        connection, 
        {
          publicKey, 
          signTransaction: async (tx) => {
            if (window.solana && window.solana.signTransaction) {
              return window.solana.signTransaction(tx)
            }
            throw new Error('Wallet adapter does not support signTransaction')
          }
        }
      )
      
      playSound(SUCCESS_SOUND_PATH, 0.3)
      toast({
        title: "NFT Unstaked!",
        description: "Your NFT has been unstaked and returned to your wallet.",
      })
      
      // Refresh data
      await fetchWalletData()
      
      // Switch to wallet tab
      setActiveTab('wallet')
    } catch (error) {
      console.error('Error unstaking NFT:', error)
      playSound(ERROR_SOUND_PATH, 0.3)
      
      let errorMessage = "An error occurred while unstaking your NFT."
      if (error instanceof Error) {
        errorMessage = error.message
      }
      
      toast({
        title: "Unstaking error",
        description: errorMessage,
        variant: "destructive"
      })
    } finally {
      setUnstakingInProgress(false)
      setSelectedNftMint("")
    }
  }
  
  // Handle reward claiming
  const handleClaimRewards = async (nftMint: string) => {
    if (!connected || !publicKey) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to claim rewards",
        variant: "destructive"
      })
      return
    }
    
    if (!hasSufficientBalance) {
      toast({
        title: "Insufficient SOL",
        description: "Your wallet has insufficient SOL for transaction fees",
        variant: "destructive"
      })
      playSound(ERROR_SOUND_PATH, 0.3)
      return
    }
    
    if (claimingInProgress) return
    
    try {
      setClaimingInProgress(true)
      setSelectedNftMint(nftMint)
      playSound(CLICK_SOUND_PATH, 0.3)
      
      // Create claim rewards transaction
      const transaction = await createClaimRewardsTransaction(
        connection,
        publicKey,
        new PublicKey(nftMint)
      )
      
      // Send transaction
      await sendTransaction(
        transaction, 
        connection, 
        {
          publicKey, 
          signTransaction: async (tx) => {
            if (window.solana && window.solana.signTransaction) {
              return window.solana.signTransaction(tx)
            }
            throw new Error('Wallet adapter does not support signTransaction')
          }
        }
      )
      
      playSound(SUCCESS_SOUND_PATH, 0.3)
      toast({
        title: "Rewards Claimed!",
        description: "Your staking rewards have been claimed successfully.",
      })
      
      // Refresh data
      await fetchWalletData()
    } catch (error) {
      console.error('Error claiming rewards:', error)
      playSound(ERROR_SOUND_PATH, 0.3)
      
      let errorMessage = "An error occurred while claiming your rewards."
      if (error instanceof Error) {
        errorMessage = error.message
      }
      
      toast({
        title: "Claiming error",
        description: errorMessage,
        variant: "destructive"
      })
    } finally {
      setClaimingInProgress(false)
      setSelectedNftMint("")
    }
  }
  
  // Format time display
  const formatTimeAgo = (timestamp?: number): string => {
    if (!timestamp) return "Unknown"
    
    const now = Math.floor(Date.now() / 1000)
    const secondsAgo = now - timestamp
    
    if (secondsAgo < 60) return `${secondsAgo} seconds ago`
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)} minutes ago`
    if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)} hours ago`
    return `${Math.floor(secondsAgo / 86400)} days ago`
  }
  
  // Update the NFT card component
  const NftCard = ({ nft, isStaked = false }: { nft: StakedNFT, isStaked?: boolean }) => {
    const isLoading = loadingStates[nft.mint] || false;
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const maxRetryAttempts = 2;

    // Extract Pookie number from name if available
    const nameMatch = nft.name?.match(/Pookie #(\d+)/i);
    const pookieNumber = (nft as any).pookieNumber || 
                         (nameMatch ? nameMatch[1] : null);

    // Derive fallback image URL if we have a pookie number
    const getFallbackImageUrl = () => {
      if (pookieNumber) {
        return `https://arweave.net/DuHCK6NWnzZKUfNbTDvLMnkXKsZbD6iOaG3DDkXj3rs/${pookieNumber}.png`;
      }
      return '/images/pookie-smashin.gif';
    };

    // Try alternate image loading strategies
    const handleImageError = () => {
      if (retryCount < maxRetryAttempts) {
        // Try using different sources in order:
        // 1. First try: Original image URL
        // 2. Second try: Number-based fallback if available
        // 3. Last resort: Default fallback

        setRetryCount(prevCount => prevCount + 1);
        
        // Force a reload with a new URL based on retry count
        if (retryCount === 0 && pookieNumber) {
          // On first error, try number-based URL
          console.log(`Trying pookieNumber based URL for ${nft.mint}: ${getFallbackImageUrl()}`);
          // Do not set image error yet, we'll try the fallback URL
        } else {
          // On second error, use default fallback
          console.log(`Using default fallback for ${nft.mint}`);
          setImageError(true);
        }
      } else {
        // After max retries, give up and use the default fallback
        setImageError(true);
        setImageLoaded(true);
      }
    };

    // Determine the current image URL based on state
    const getImageUrl = () => {
      if (imageError) {
        return '/images/pookie-smashin.gif';
      }
      
      if (retryCount === 1 && pookieNumber) {
        return getFallbackImageUrl();
      }
      
      return nft.image;
    };

    return (
      <Card className="relative overflow-hidden bg-card/50 hover:bg-card/80 transition-all duration-200">
        <CardHeader className="p-4">
          <CardTitle className="text-sm font-medium truncate">{nft.name}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative aspect-square">
            {/* Show skeleton while loading */}
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                <Skeleton className="w-full h-full" />
              </div>
            )}
            {/* NFT Image with key to force reload on src change */}
            <Image
              key={`${nft.mint}-${retryCount}`}
              src={getImageUrl()}
              alt={nft.name}
              width={300}
              height={300}
              className={`w-full h-full object-cover transition-opacity duration-200 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={handleImageError}
              priority={true}
              loading="eager"
            />
            {/* Loading overlay */}
            {isLoading && (
              <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="p-4 flex flex-col gap-2">
          {isStaked ? (
            <>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ClockIcon size={12} />
                <span>Staked {formatTimeAgo(nft.stakedAt)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <CoinsIcon size={12} />
                <span>{nft.currentReward?.toFixed(2) || '0'} POOKIE earned</span>
              </div>
              <Button 
                variant="destructive" 
                size="sm"
                className="w-full"
                disabled={isLoading || unstakingInProgress}
                onClick={() => handleUnstakeNft(nft.mint)}
              >
                {unstakingInProgress && selectedNftMint === nft.mint ? 'Unstaking...' : 'Unstake & Claim'}
              </Button>
            </>
          ) : (
            <Button 
              variant="default" 
              size="sm"
              className="w-full"
              disabled={isLoading || stakingInProgress}
              onClick={() => handleStakeNft(nft.mint)}
            >
              {stakingInProgress && selectedNftMint === nft.mint ? 'Staking...' : 'Stake NFT'}
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  };
  
  // Update the grid rendering component
  const renderNftGrid = (nfts: StakedNFT[], isStaked = false) => {
    if (!connected) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <WalletIcon className="w-12 h-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Connect your wallet to view your NFTs</p>
        </div>
      );
    }

    if (initialLoading) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="bg-card/50">
              <CardHeader className="p-4">
                <Skeleton className="h-4 w-3/4" />
              </CardHeader>
              <CardContent className="p-0">
                <Skeleton className="aspect-square" />
              </CardContent>
              <CardFooter className="p-4">
                <Skeleton className="h-8 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      );
    }

    if (nfts.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          {isStaked ? (
            <>
              <CoinsIcon className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No staked NFTs found</p>
            </>
          ) : (
            <>
              <AlertTriangleIcon className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No Pookie NFTs found in wallet</p>
            </>
          )}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {nfts.map((nft) => (
          <NftCard key={nft.mint} nft={nft} isStaked={isStaked} />
        ))}
      </div>
    );
  };

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
         // Reset state more comprehensively
         setIsLoading(false);
         setInitialLoading(false); // Ensure initial loading is reset
         setStakingInProgress(false);
         setUnstakingInProgress(false); 
         setClaimingInProgress(false);
         setSelectedNftMint("");
         setError(null);
         setMetadataLoading({}); // Reset metadata loading
         isFetchingRef.current = false; // Reset fetch ref
         
         // Trigger a fresh fetch if connected
         if (connected && publicKey) {
           fetchWalletData();
         }
      }}
    >
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">NFT Staking</h2>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            // Disable refresh if initial loading or any metadata is loading
            disabled={initialLoading || Object.values(metadataLoading).some(loading => loading) || isLoading || !connected}
          >
            {/* Use initialLoading or isLoading to show spin */}
            <RefreshCwIcon size={16} className={`mr-2 ${(initialLoading || isLoading) ? 'animate-spin' : ''}`} /> 
            Refresh
          </Button>
        </div>
        
        {/* Stats panel for staked NFTs */}
        {stakedNfts.length > 0 && (
          <div className="bg-background/60 border border-primary/20 rounded-lg p-4 mb-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Staked NFTs</p>
                <p className="text-2xl font-bold">{stakedNfts.length}</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Rewards</p>
                <p className="text-2xl font-bold">{totalRewards} $POOKIE</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Daily Earnings</p>
                <p className="text-2xl font-bold">{stakedNfts.length * 250} $POOKIE</p>
              </div>
              
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Reward Rate</p>
                <p className="text-2xl font-bold">250 / day</p>
              </div>
            </div>
          </div>
        )}
        
        <Tabs defaultValue="wallet" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 w-full mb-4">
            <TabsTrigger value="wallet" className="text-center">
              Wallet NFTs
              {walletNfts.length > 0 && <span className="ml-1 text-xs">({walletNfts.length})</span>}
            </TabsTrigger>
            <TabsTrigger value="staked" className="text-center">
              Staked NFTs
              {stakedNfts.length > 0 && <span className="ml-1 text-xs">({stakedNfts.length})</span>}
            </TabsTrigger>
          </TabsList>
          
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <TabsContent value="wallet" className="mt-0">
                {renderNftGrid(walletNfts, false)}
              </TabsContent>
              
              <TabsContent value="staked" className="mt-0">
                {renderNftGrid(stakedNfts, true)}
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </div>
    </ErrorBoundary>
  )
} 