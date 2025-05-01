"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
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
import { cn } from '@/lib/utils'

// Sound paths
const CLICK_SOUND_PATH = '/sounds/click-sound.wav'
const SUCCESS_SOUND_PATH = '/sounds/success-sound.wav'
const ERROR_SOUND_PATH = '/sounds/error-sound.wav'

// Extend BaseNFT to include full metadata fetched via proxy
interface NFT extends BaseNFT {
  metadataFetched?: boolean; // Flag to check if full metadata is loaded
  // Add other potential fields from metadata JSON if needed
  description?: string;
  alternativeImageUrls?: string[]; // Array of alternative image URLs to try
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
  const [isClaimingAll, setIsClaimingAll] = useState<boolean>(false); // Loading state for Claim All
  const [isStakingAll, setIsStakingAll] = useState<boolean>(false); // Loading state for Stake All
  const [selectedWalletNfts, setSelectedWalletNfts] = useState<Set<string>>(new Set()); // For multi-select stake
  
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
      // REMOVED: Redundant metadata fetching logic removed. fetchNFTsForWallet now handles this.
      // const fetchAndUpdateMetadata = async (nftsToUpdate: StakedNFT[], setStateAction: React.Dispatch<React.SetStateAction<StakedNFT[]>>) => { ... };
      // await Promise.all([ fetchAndUpdateMetadata(...) ]);
      
      console.log("Finished processing NFT data from fetchNFTsForWallet.");

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
  // REMOVED: fetchMetadataViaProxy function is no longer needed.
  /*
  const fetchMetadataViaProxy = async (nft: StakedNFT): Promise<StakedNFT> => {
    // ... entire function removed ...
  };
  */
  
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
      
      let errorMessage = "An error occurred while staking your NFT.";
      // Attempt to get more specific error details
      if (error instanceof Error) {
        errorMessage = error.message;
        // Check if logs are available (specific error types might have them)
        if ('getLogs' in error && typeof error.getLogs === 'function') {
          try {
            const logs = await error.getLogs();
            console.error("Transaction Logs:", logs);
            // You could potentially parse logs here for specific program errors
            errorMessage += ` (Logs: ${logs.slice(0, 5).join(', ')}...)`; // Show first few logs
          } catch (logError) {
            console.error("Failed to get transaction logs:", logError);
          }
        }
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
  
  // Handle claiming rewards for ALL staked NFTs
  const handleClaimAllRewards = async () => {
    if (!connected || !publicKey) {
      toast({ title: "Wallet not connected", variant: "destructive" })
      return
    }
    if (!hasSufficientBalance) {
      toast({ title: "Insufficient SOL", description: "Not enough SOL for transaction fees", variant: "destructive" })
      playSound(ERROR_SOUND_PATH, 0.3)
      return
    }
    if (claimingInProgress || unstakingInProgress || isClaimingAll) return // Prevent overlapping actions

    const eligibleNfts = stakedNfts.filter(nft => nft.currentReward && nft.currentReward > 0);
    if (eligibleNfts.length === 0) {
      toast({ title: "No rewards to claim", description: "None of your staked NFTs have accumulated rewards yet." })
      return
    }

    setIsClaimingAll(true);
    playSound(CLICK_SOUND_PATH, 0.3);
    toast({ title: "Starting Claim All...", description: `Attempting to claim rewards for ${eligibleNfts.length} NFTs.` });

    let successCount = 0;
    let failCount = 0;

    for (const nft of eligibleNfts) {
      try {
        // Set individual loading state for the card (optional but good UX)
        setLoadingStates(prev => ({ ...prev, [nft.mint]: true })); 
        
        console.log(`Claiming rewards for ${nft.mint}...`);
        const transaction = await createClaimRewardsTransaction(
          connection,
          publicKey,
          new PublicKey(nft.mint)
        );
        
        const { signTransaction } = useWallet(); // Get signTransaction from the hook
        if (!signTransaction) {
          throw new Error('Wallet does not support signing transactions');
        }
        await sendTransaction(transaction, connection, { publicKey, signTransaction });
        
        console.log(`Successfully claimed rewards for ${nft.mint}`);
        // Optional: Individual success toast (can be noisy)
        // toast({ title: "Reward Claimed", description: `Claimed for ${nft.name}` });
        successCount++;
        
      } catch (error: any) {
        failCount++;
        console.error(`Error claiming rewards for ${nft.mint}:`, error);
        let errorMessage = error.message || "An unknown error occurred.";
        // Check if logs are available
        if ('getLogs' in error && typeof error.getLogs === 'function') {
          try {
            const logs = await error.getLogs();
            console.error(`Logs for failed claim of ${nft.mint}:`, logs);
            errorMessage += ` (Logs: ${logs.slice(0, 5).join(', ')}...)`;
          } catch (logError) {
            console.error("Failed to get transaction logs:", logError);
          }
        }
        // Optional: Individual error toast
        // toast({ title: "Claim Error", description: `Failed for ${nft.name}: ${errorMessage}`, variant: "destructive" });
      } finally {
         // Reset individual loading state
         setLoadingStates(prev => ({ ...prev, [nft.mint]: false }));
      }
      
      // Small delay between transactions to avoid RPC rate limits
      await new Promise(resolve => setTimeout(resolve, 500)); 
    }

    playSound(successCount > 0 ? SUCCESS_SOUND_PATH : ERROR_SOUND_PATH, 0.3);
    toast({ 
      title: "Claim All Finished",
      description: `Successfully claimed for ${successCount} NFTs. Failed for ${failCount} NFTs. Refreshing data...`,
      variant: "default"
    });

    // Refresh data after all attempts
    await fetchWalletData(); 
    setIsClaimingAll(false);
  }
  
  // Handle staking ALL NFTs from the wallet tab
  const handleStakeAll = async () => {
    if (!connected || !publicKey) {
      toast({ title: "Wallet not connected", variant: "destructive" })
      return
    }
    if (!hasSufficientBalance) {
      toast({ title: "Insufficient SOL", description: "Not enough SOL for transaction fees", variant: "destructive" })
      playSound(ERROR_SOUND_PATH, 0.3)
      return
    }
    if (claimingInProgress || unstakingInProgress || isClaimingAll || isStakingAll || stakingInProgress) return 

    // Stake only the selected NFTs
    const nftsToStake = walletNfts.filter(nft => selectedWalletNfts.has(nft.mint));
    
    if (nftsToStake.length === 0) {
      toast({ title: "No NFTs selected", description: "Please select the NFTs you wish to stake." })
      return
    }

    // Optional: Confirmation dialog (implement if needed)
    // const confirmed = await showConfirmationDialog(`Stake ${nftsToStake.length} selected NFTs?`);
    // if (!confirmed) return;

    setIsStakingAll(true);
    playSound(CLICK_SOUND_PATH, 0.3);
    toast({ title: "Starting Stake Selected...", description: `Attempting to stake ${nftsToStake.length} selected NFTs.` });

    let successCount = 0;
    let failCount = 0;

    // Iterate over selected NFTs
    for (const nft of nftsToStake) {
      try {
        // Set individual loading state for the card
        setLoadingStates(prev => ({ ...prev, [nft.mint]: true })); 
        
        console.log(`Staking ${nft.mint}...`);
        const transaction = await createStakeNftTransaction(
          connection,
          publicKey,
          new PublicKey(nft.mint)
        );

        const { signTransaction } = useWallet(); 
        if (!signTransaction) {
          throw new Error('Wallet does not support signing transactions');
        }
        await sendTransaction(transaction, connection, { publicKey, signTransaction });
        
        console.log(`Successfully staked ${nft.mint}`);
        successCount++;
        
      } catch (error: any) {
        failCount++;
        console.error(`Error staking ${nft.mint}:`, error);
        let errorMessage = error.message || "An unknown error occurred.";
        // Check if logs are available
        if ('getLogs' in error && typeof error.getLogs === 'function') {
          try {
            const logs = await error.getLogs();
            console.error(`Logs for failed stake of ${nft.mint}:`, logs);
            errorMessage += ` (Logs: ${logs.slice(0, 5).join(', ')}...)`;
          } catch (logError) {
            console.error("Failed to get transaction logs:", logError);
          }
        }
        // Optional: Individual error toast
        // toast({ title: "Stake Error", description: `Failed for ${nft.name}: ${errorMessage}`, variant: "destructive" });
      } finally {
         // Reset individual loading state
         setLoadingStates(prev => ({ ...prev, [nft.mint]: false }));
      }
      
      // Small delay between transactions
      await new Promise(resolve => setTimeout(resolve, 500)); 
    }

    playSound(successCount > 0 ? SUCCESS_SOUND_PATH : ERROR_SOUND_PATH, 0.3);
    toast({ 
      title: "Stake All Finished", 
      description: `Successfully staked ${successCount} NFTs. Failed for ${failCount} NFTs. Refreshing data...`,
      variant: failCount > 0 ? "default" : "default"
    });

    // Refresh data after all attempts
    await fetchWalletData(); 
    setIsStakingAll(false);
    setSelectedWalletNfts(new Set()); // Clear selection after staking
    // Switch to staked tab if any succeeded
    if (successCount > 0) {
      setActiveTab('staked');
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
  
  // Update the NFT card component - Wrap with React.memo
  const NftCard = React.memo(({ 
    nft, 
    isStaked = false, 
    isSelected = false, // New prop for selection state
    onSelect // New prop for handling selection click
  }: { 
    nft: StakedNFT;
    isStaked?: boolean;
    isSelected?: boolean;
    onSelect?: (mint: string) => void;
  }) => {
    const isLoading = loadingStates[nft.mint] || false;
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const maxRetries = 2;
    
    // Define fallback image paths
    const fallbackImagePath = '/images/pookie-smashin.gif';
    
    // Create an array of possible image URLs to try
    const possibleImageUrls = useMemo(() => {
      // Start with the main image
      const urls = [nft.image];
      
      // Add alternative URLs if provided from the backend
      if (nft.alternativeImageUrls && Array.isArray(nft.alternativeImageUrls)) {
        urls.push(...nft.alternativeImageUrls);
      }
      
      // Add mint-based fallback
      urls.push(`https://arweave.net/DuHCK6NWnzZKUfNbTDvLMnkXKsZbD6iOaG3DDkXj3rs`);
      
      // Try gateway variations for IPFS
      if (nft.image && nft.image.includes('ipfs://')) {
        const ipfsHash = nft.image.replace('ipfs://', '');
        urls.push(`https://gateway.pinata.cloud/ipfs/${ipfsHash}`);
        urls.push(`https://cloudflare-ipfs.com/ipfs/${ipfsHash}`);
        urls.push(`https://ipfs.io/ipfs/${ipfsHash}`);
      }
      
      // Add the final fallback image
      urls.push(fallbackImagePath);
      
      // Filter out duplicates and nulls, then explicitly convert Set to Array
      return Array.from(new Set(urls.filter(Boolean)));
    }, [nft.image, nft.alternativeImageUrls]);
    
    // Function to handle image load errors with retry and URL cycling
    const handleImageError = () => {
      // Add a small delay before trying the next URL or retry
      setTimeout(() => {
        // Try the next URL in our list
        if (currentImageIndex < possibleImageUrls.length - 1) {
          setCurrentImageIndex(prev => prev + 1);
          console.log(`Trying alternative URL for ${nft.name}: ${possibleImageUrls[currentImageIndex + 1]}`);
        } 
        // Or retry with the same URL if we haven't exceeded retries
        else if (retryCount < maxRetries) {
          setRetryCount(prev => prev + 1);
          console.log(`Retrying image load for ${nft.name}, attempt ${retryCount + 1}/${maxRetries}`);
        } 
        // Use fallback after exhausting all options
        else {
          setImageError(true);
          setImageLoaded(true);
          console.log(`Using fallback image for ${nft.name} after all attempts failed`);
        }
      }, 300); // Increased delay slightly (300ms)
    };

    // Compute the current image source based on our fallback strategy
    const imageSrc = imageError 
      ? fallbackImagePath 
      : possibleImageUrls[currentImageIndex] || fallbackImagePath;

    // Handler for clicking the card itself (for selection)
    const handleCardClick = () => {
      if (!isStaked && onSelect) { // Only allow selection on wallet NFTs
        onSelect(nft.mint);
      }
    };

    return (
      <Card 
        className={cn(
          "relative overflow-hidden bg-card/50 hover:bg-card/80 transition-all duration-200 cursor-pointer",
          isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background", // Style for selected card
          isStaked && "cursor-default" // Don't show pointer cursor for staked cards
        )}
        onClick={handleCardClick} // Click handler for selection
      >
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
            {/* NFT Image */}
            <Image
              key={`${nft.mint}-${currentImageIndex}-${retryCount}`} // Add indices to force new image element on changes
              src={imageSrc}
              alt={nft.name}
              width={300}
              height={300}
              className={`w-full h-full object-cover transition-opacity duration-200 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={handleImageError}
              priority={isStaked} // Prioritize loading staked NFTs
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
                {isLoading ? 'Unstaking...' : 'Unstake & Claim'}
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
              {isLoading ? 'Staking...' : 'Stake NFT'}
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  });
  NftCard.displayName = 'NftCard'; // Good practice for debugging memoized components
  
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
          <NftCard 
            key={nft.mint} 
            nft={nft} 
            isStaked={isStaked} 
            isSelected={!isStaked && selectedWalletNfts.has(nft.mint)} // Pass selection state only for wallet NFTs
            onSelect={handleSelectNft} // Pass selection handler
          />
        ))}
      </div>
    );
  };

  // Handle selecting/deselecting an NFT in the wallet tab
  const handleSelectNft = (mint: string) => {
    setSelectedWalletNfts(prevSelected => {
      const newSelection = new Set(prevSelected);
      if (newSelection.has(mint)) {
        newSelection.delete(mint);
      } else {
        newSelection.add(mint);
      }
      return newSelection;
    });
  };

  // Handle Select All / Deselect All for Wallet NFTs
  const handleToggleSelectAllWallet = () => {
    if (selectedWalletNfts.size === walletNfts.length) {
      // If all are selected, deselect all
      setSelectedWalletNfts(new Set());
    } else {
      // Otherwise, select all
      setSelectedWalletNfts(new Set(walletNfts.map(nft => nft.mint)));
    }
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
            {/* Add Claim All Button Here */}
            <div className="mt-4 flex justify-center"> 
              <Button
                onClick={handleClaimAllRewards}
                disabled={!connected || isClaimingAll || stakingInProgress || unstakingInProgress || totalRewards <= 0}
                size="lg"
                variant="default"
              >
                {isClaimingAll ? (
                  <>
                    <RefreshCwIcon className="mr-2 h-4 w-4 animate-spin" />
                    Claiming...
                  </>
                ) : (
                  `Claim All (${totalRewards.toFixed(2)} $POOKIE)`
                )}
              </Button>
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
                {/* Add Stake All Button Here */} 
                {walletNfts.length > 0 && (
                  <div className="mb-4 flex justify-center gap-4"> 
                    {/* Select / Deselect All Button */}
                    <Button
                      onClick={handleToggleSelectAllWallet}
                      disabled={!connected || walletNfts.length === 0}
                      size="lg"
                      variant="outline" 
                    >
                      {selectedWalletNfts.size === walletNfts.length ? "Deselect All" : "Select All"}
                    </Button>
                    
                    {/* Stake Selected Button */}
                    <Button
                      onClick={handleStakeAll} // Re-using the logic, now scoped to selected
                      disabled={!connected || isStakingAll || stakingInProgress || selectedWalletNfts.size === 0}
                      size="lg"
                      variant="default" 
                    >
                      {isStakingAll ? (
                        <>
                          <RefreshCwIcon className="mr-2 h-4 w-4 animate-spin" />
                          Staking Selected...
                        </>
                      ) : (
                        `Stake Selected (${selectedWalletNfts.size})`
                      )}
                    </Button>
                  </div>
                )}
                {/* Add scroll container */}
                <div className="max-h-[60vh] overflow-y-auto pr-2"> 
                  {renderNftGrid(walletNfts, false)}
                </div>
              </TabsContent>
              
              <TabsContent value="staked" className="mt-0">
                {/* Add scroll container */}
                <div className="max-h-[60vh] overflow-y-auto pr-2">
                  {renderNftGrid(stakedNfts, true)}
                </div>
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </div>
    </ErrorBoundary>
  )
} 