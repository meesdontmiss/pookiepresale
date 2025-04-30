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
      const baseNfts = await fetchNFTsForWallet(walletAddress)
      
      console.log("Base NFTs fetched (URI in image field):", baseNfts);

      if (baseNfts.length === 0) {
        console.log("No base NFTs found for this wallet.");
        setWalletNfts([])
        setStakedNfts([])
        setTotalRewards(0)
        // No need for setIsLoading/setInitialLoading here, finally block handles it
        // Removed: setInitialLoading(false)
        // Removed: setIsLoading(false)
        return // Early return is okay, finally will still run
      }
      
      // Check staking status for each NFT
      const nftsWithStakingStatus: StakedNFT[] = await Promise.all(
        baseNfts.map(async (nft) => {
          try {
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
            // Propagate error to allow Promise.all to handle potential rate limits gracefully
            // Consider if you want partial data or full failure on stakingInfo error
            // For now, return base NFT assuming not staked on error
            return {
              ...nft,
              isStaked: false,
              metadataFetched: false, 
            }
          }
        })
      )
      
      console.log("NFTs with staking status (pre-metadata fetch):", nftsWithStakingStatus);

      // Separate staked and unstaked NFTs *before* full metadata fetch
      let stakedBase: StakedNFT[] = nftsWithStakingStatus.filter(nft => nft.isStaked)
      let unstakedBase: StakedNFT[] = nftsWithStakingStatus.filter(nft => !nft.isStaked)
      
      // Update state with base data first for quicker initial render
      setWalletNfts(unstakedBase);
      setStakedNfts(stakedBase);
      setTotalRewards(stakedBase.reduce((sum, nft) => sum + (nft.currentReward || 0), 0));
      
      // Removed: setIsLoading(false); // Base data loaded - handled in finally
      // Removed: setInitialLoading(false); - handled in finally

      // Now, fetch full metadata via proxy for all NFTs (staked and unstaked)
      const fetchAndUpdateMetadata = async (nftsToUpdate: StakedNFT[], setStateAction: React.Dispatch<React.SetStateAction<StakedNFT[]>>) => {
         // Create a stable copy of the current state to update from
         let currentNfts = [...nftsToUpdate]; 
         const updatedNftPromises = currentNfts.map(async (nft, index) => {
           const fullDataNft = await fetchMetadataViaProxy(nft);
           // Update the specific NFT in the copied array
           currentNfts[index] = fullDataNft; 
           // Update state progressively if needed, or just once at the end
           // For simplicity, we update once after Promise.all
           return fullDataNft; 
         });
    
         const finalUpdatedNfts = await Promise.all(updatedNftPromises);
         setStateAction(finalUpdatedNfts); // Update state with the complete list
       };

      // Fetch for unstaked and staked NFTs concurrently
      await Promise.all([
        fetchAndUpdateMetadata(unstakedBase, setWalletNfts),
        fetchAndUpdateMetadata(stakedBase, setStakedNfts)
      ]);
      
      console.log("Finished fetching full metadata via proxy.");

    } catch (error) {
      console.error('Error fetching wallet data:', error)
      // Check for specific errors like rate limits if needed
      if (error instanceof Error && (error as any).mint) {
         setError(`Failed to load staking info for ${ (error as any).mint}. Rate limited?`);
      } else if (axios.isAxiosError(error) && error.response?.status === 429) {
         setError('RPC rate limit hit. Please wait and refresh.');
      }
       else {
        setError('Failed to load NFT data. Please try refreshing.');
      }
      toast({
        title: "Error loading NFTs",
        description: error instanceof Error ? error.message : "An unknown error occurred.",
        variant: "destructive"
      })
    } finally {
      // Ensure loading states are always reset
      setIsLoading(false);
      setInitialLoading(false);
      isFetchingRef.current = false; // Clear fetching flag
      // Keep metadataLoading state as is, it's managed within fetchMetadataViaProxy
    }
  // Add dependencies for useCallback
  }, [publicKey, connection]); 

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
    if (!nft.image || !nft.image.startsWith('http')) return { ...nft, metadataFetched: true }; 

    const uri = nft.image; 
    setMetadataLoading(prev => ({ ...prev, [nft.mint]: true }));
    console.log(`[fetchMetadataViaProxy] Attempting to fetch for mint ${nft.mint} via proxy. URI: ${uri}`); // <-- Added log

    try {
      const response = await axios.get(`/api/nft/metadata?uri=${encodeURIComponent(uri)}`);
      const fullMetadata = response.data;
      return {
          ...nft, 
          name: fullMetadata.name || nft.name, 
          image: fullMetadata.image || '/images/pookie-smashin.gif', 
          description: fullMetadata.description || '',
          attributes: fullMetadata.attributes || [],
          metadataFetched: true,
        };
    } catch (error) {
       console.error(`[fetchMetadataViaProxy] Failed to fetch metadata for ${nft.mint} from proxy:`, error); // <-- Enhanced log
       return { 
           ...nft, 
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
  
  // NFT card component
  const NftCard = ({ nft, isStaked = false }: { nft: StakedNFT, isStaked?: boolean }) => {
    const info = stakedNfts.find(n => n.mint === nft.mint)
    const isLoadingMetadata = metadataLoading[nft.mint] || false
    
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="relative group"
      >
        <Card className="overflow-hidden bg-card/80 backdrop-blur-sm hover:shadow-lg transition-shadow duration-300 border-primary/20">
          <CardContent className="p-0 aspect-square relative">
            {isLoadingMetadata ? (
              <Skeleton className="w-full h-full" />
            ) : (
              <Image 
                src={nft.image || '/images/pookie-smashin.gif'} // Use fetched or fallback image
                alt={nft.name || `NFT ${nft.mint.slice(0, 6)}`}
                width={300} // Set appropriate dimensions
                height={300}
                className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-105"
                priority={!isStaked} // Prioritize loading wallet NFTs
                unoptimized={nft.image?.endsWith('.gif')} // Avoid optimization for GIFs
              />
            )}
            {isStaked && (
              <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 text-xs rounded-full font-semibold shadow-md">
                STAKED
              </div>
            )}
          </CardContent>
          
          <CardFooter className="p-2">
            <h3 className="text-sm font-medium mb-1 truncate">{nft.name}</h3>
            
            {isStaked ? (
              <div className="space-y-2 mt-2">
                <div className="flex items-center text-xs text-muted-foreground">
                  <ClockIcon size={12} className="mr-1" />
                  <span>Staked: {info?.daysStaked} days</span>
                </div>
                
                <div className="flex items-center text-xs text-muted-foreground">
                  <CoinsIcon size={12} className="mr-1" />
                  <span>Rewards: {info?.currentReward} $POOKIE</span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleClaimRewards(nft.mint)}
                    disabled={claimingInProgress && selectedNftMint === nft.mint || !hasSufficientBalance}
                    className="w-full text-xs h-8"
                  >
                    {claimingInProgress && selectedNftMint === nft.mint ? (
                      <div className="flex items-center">
                        <RefreshCwIcon size={12} className="mr-1 animate-spin" />
                        Claiming...
                      </div>
                    ) : (
                      "Claim Rewards"
                    )}
                  </Button>
                  
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => handleUnstakeNft(nft.mint)}
                    disabled={unstakingInProgress && selectedNftMint === nft.mint || !hasSufficientBalance}
                    className="w-full text-xs h-8"
                  >
                    {unstakingInProgress && selectedNftMint === nft.mint ? (
                      <div className="flex items-center">
                        <RefreshCwIcon size={12} className="mr-1 animate-spin" />
                        Unstaking...
                      </div>
                    ) : (
                      "Unstake"
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <Button 
                variant="default" 
                size="sm"
                onClick={() => handleStakeNft(nft.mint)}
                disabled={stakingInProgress && selectedNftMint === nft.mint || !hasSufficientBalance}
                className="w-full mt-2 h-8"
              >
                {stakingInProgress && selectedNftMint === nft.mint ? (
                  <div className="flex items-center">
                    <RefreshCwIcon size={14} className="mr-1 animate-spin" />
                    Staking...
                  </div>
                ) : (
                  "Stake NFT"
                )}
              </Button>
            )}
          </CardFooter>
        </Card>
      </motion.div>
    )
  }
  
  // Render NFT grid with loading states
  const renderNftGrid = (nfts: StakedNFT[], isStaked = false, isLoadingProp = false) => { // Renamed isLoading prop
    const showInitialLoading = initialLoading && !error; // Show initial loading only if no error
    const showMetadataSkeletons = !initialLoading && Object.values(metadataLoading).some(loading => loading);

    if (showInitialLoading) {
       return (
         <div className="py-10 flex flex-col items-center justify-center">
           <RefreshCwIcon size={40} className="animate-spin text-primary/50 mb-4" />
           <p className="text-center text-muted-foreground">Loading NFTs and staking data...</p>
         </div>
       )
    }
    
    // Show skeletons if metadata is loading OR if the main fetch is still considered loading (isLoadingProp)
    if (showMetadataSkeletons || isLoadingProp) { 
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[...Array(nfts.length > 0 ? nfts.length : 5)].map((_, i) => ( // Render skeletons based on expected number or default
            <Skeleton key={i} className="aspect-square w-full h-auto rounded-lg" />
          ))}
        </div>
      )
    }

    // Handle connection errors or specific fetch errors
    if (error) {
      return (
        <div className="py-10 flex flex-col items-center justify-center">
          <AlertTriangleIcon size={40} className="text-destructive mb-4" />
          <p className="text-destructive font-medium">Error Loading Data</p>
          <p className="text-center text-muted-foreground mt-2">{error}</p>
          <Button onClick={handleRefresh} variant="outline" size="sm" className="mt-4">Try Again</Button>
        </div>
      )
    }
    
    if (!connected) {
       return (
         <div className="py-12 flex flex-col items-center justify-center">
           <WalletIcon size={40} className="text-primary/50 mb-4" />
           <p className="text-muted-foreground mb-4">Connect your wallet to view and stake your NFTs</p>
           {/* <WalletMultiButton /> */}
           <p className="text-xs text-muted-foreground/70 max-w-sm text-center mt-4">
              Connect your Solana wallet to view your NFTs, stake them, and earn $POOKIE rewards.
           </p>
         </div>
       )
    }
    
    if (nfts.length === 0) {
       return (
         <div className="py-10 flex flex-col items-center justify-center">
           {isStaked ? (
             <>
               <ClockIcon size={40} className="text-primary/50 mb-4" />
               <p className="text-muted-foreground">No NFTs staked yet</p>
               <p className="text-xs text-muted-foreground/70 mt-2">
                 Stake your NFTs from the Wallet tab to start earning $POOKIE rewards.
               </p>
             </>
           ) : (
             <>
               <CoinsIcon size={40} className="text-primary/50 mb-4" />
               <p className="text-muted-foreground">No eligible NFTs found in your wallet</p>
               <p className="text-xs text-muted-foreground/70 mt-2">
                 Ensure you hold Pookie NFTs from the correct collection ({BaseNFT.POOKIE_COLLECTION_ADDRESS?.slice(0,6)}...).
               </p>
             </>
           )}
         </div>
       )
    }
    
    return (
       <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
         {nfts.map((nft) => (
           <NftCard 
             key={nft.mint} 
             nft={nft} 
             isStaked={isStaked} 
           />
         ))}
       </div>
    )
  }

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
                {renderNftGrid(walletNfts, false, isLoading)}
              </TabsContent>
              
              <TabsContent value="staked" className="mt-0">
                {renderNftGrid(stakedNfts, true, isLoading)}
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </div>
    </ErrorBoundary>
  )
} 