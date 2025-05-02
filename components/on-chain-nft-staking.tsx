"use client"

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  SYSVAR_RENT_PUBKEY, 
  SYSVAR_CLOCK_PUBKEY 
} from '@solana/web3.js'
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
  getMultipleStakingInfo,
  isNftStaked,
  sendTransaction,
  getTokenBalance,
  hasEnoughSol,
  StakingError,
  STAKING_PROGRAM_ID,
  REWARDS_TOKEN_MINT // Assuming REWARDS_TOKEN_MINT is exported from here
} from '@/utils/solana-staking-client' // Make sure REWARDS_TOKEN_MINT is exported
import { ErrorBoundary } from 'react-error-boundary'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import axios from 'axios'
import { cn } from '@/lib/utils'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'

// Sound paths
const CLICK_SOUND_PATH = '/sounds/click-sound.wav'
const SUCCESS_SOUND_PATH = '/sounds/success-sound.wav'
const ERROR_SOUND_PATH = '/sounds/error-sound.wav'
const KIDS_CHEER_SOUND_PATH = '/sounds/kidscheer.mp3' // Added new sound path

// Extend BaseNFT to include full metadata fetched via proxy
interface NFT extends BaseNFT {
  metadataFetched?: boolean; // Flag to check if full metadata is loaded
  description?: string;
  alternativeImageUrls?: string[]; // Array of alternative image URLs to try
}

// NFT staking interface with additional staking data
interface StakedNFT extends NFT {
  isStaked: boolean
  stakedAt?: number
  daysStaked?: number
  currentReward?: number // Reward calculated at fetch time
  lastClaimTime?: number; // Add missing property
}

// --- Add reward rate constant ---
const POOKIE_DECIMALS = 9; // Assuming 9 decimals for the reward token $POOKIE
const DAILY_REWARD_RATE_TOKENS = 250; // 250 $POOKIE per day
const REWARD_RATE_PER_SECOND_WITH_DECIMALS = BigInt(DAILY_REWARD_RATE_TOKENS * (10 ** POOKIE_DECIMALS)) / BigInt(86400);
// --- End Add reward rate constant ---

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

// --- Add the audio playback function ---
const playSuccessSound = async (volume = 0.3, duration = 3) => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const response = await fetch(KIDS_CHEER_SOUND_PATH);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;

    const gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);

    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    source.start(0);

    const fadeStartTime = audioContext.currentTime + duration - 0.5;
    const fadeEndTime = audioContext.currentTime + duration;
    if (fadeStartTime > audioContext.currentTime) {
       gainNode.gain.linearRampToValueAtTime(0, fadeEndTime);
    }

    source.stop(fadeEndTime);

  } catch (error) {
    console.error("Error playing success sound:", error);
  }
};

// Main Staking Component
export default function OnChainNftStaking() {
  const { connection } = useConnection()
  const wallet = useWallet(); // Use the full wallet object
  const { connected, publicKey, signTransaction, connecting, disconnect } = wallet;
  const [walletNfts, setWalletNfts] = useState<StakedNFT[]>([])
  const [stakedNfts, setStakedNfts] = useState<StakedNFT[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [initialLoading, setInitialLoading] = useState<boolean>(true)
  const [totalRewards, setTotalRewards] = useState<bigint>(BigInt(0)); // Use BigInt for total
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
  const [isClaimingAll, setIsClaimingAll] = useState<boolean>(false);
  const [isStakingAll, setIsStakingAll] = useState<boolean>(false);
  const [selectedWalletNfts, setSelectedWalletNfts] = useState<Set<string>>(new Set());
  const [stakedSuccessMint, setStakedSuccessMint] = useState<string | null>(null);
  
  const refreshTimer = useRef<NodeJS.Timeout | null>(null)
  const connectedRef = useRef<boolean>(false)
  const isFetchingRef = useRef<boolean>(false);

  // Memoized calculation for total rewards based on live data
  // This requires NftCard to potentially lift its state up or use context/zustand
  // For now, we'll keep the totalRewards based on fetched data, but acknowledge live updates happen per card
  useEffect(() => {
    // This calculation is based on fetched data, not live updates from cards
    const calculatedTotal = stakedNfts.reduce((sum, nft) => {
        const startTime = nft.lastClaimTime && nft.lastClaimTime > 0 ? nft.lastClaimTime : nft.stakedAt;
        if (!startTime) return sum;
        const nowSeconds = Date.now() / 1000;
        const elapsedSeconds = BigInt(Math.max(0, Math.floor(nowSeconds - startTime)));
        const currentAccruedReward = elapsedSeconds * REWARD_RATE_PER_SECOND_WITH_DECIMALS;
        return sum + currentAccruedReward;
    }, BigInt(0));
    setTotalRewards(calculatedTotal);
  }, [stakedNfts]); // Recalculate when stakedNfts list changes


  // Wrap fetchWalletData in useCallback
  const fetchWalletData = useCallback(async () => {
    if (isFetchingRef.current) return;
    if (!publicKey || !connection) return
    
    isFetchingRef.current = true;
    console.log("Fetching wallet data...");
    setError(null)
    setInitialLoading(true)
    setMetadataLoading({});
    try {
      const walletAddress = publicKey.toString()
      const timeoutId = setTimeout(() => {
        toast({ title: "Taking a while...", description: "Network might be busy.", duration: 5000 });
      }, 8000);
      
      const baseNfts = await fetchNFTsForWallet(walletAddress)
      clearTimeout(timeoutId);
      console.log(`Fetched ${baseNfts.length} base NFTs`);

      if (baseNfts.length === 0) {
        setWalletNfts([])
        setStakedNfts([])
        setTotalRewards(BigInt(0))
        setError("No Pookie NFTs found in this wallet.");
        return
      }

      const mintAddresses = baseNfts.map(nft => new PublicKey(nft.mint));
      const stakingInfoMap = await getMultipleStakingInfo(connection, publicKey, mintAddresses);
      console.log("Staking Info Map:", stakingInfoMap);
      
      const nftsWithStakingStatus: StakedNFT[] = baseNfts.map(nft => {
        const stakingInfo = stakingInfoMap.get(nft.mint) || { 
          isStaked: false, 
          stakedAt: 0, 
          daysStaked: 0, 
          currentReward: 0, 
          lastClaimTime: 0 // Add default
        };
          return {
          ...nft, // Base NFT data
          // Spread all properties from stakingInfo
            isStaked: stakingInfo.isStaked,
            stakedAt: stakingInfo.stakedAt,
          // daysStaked: stakingInfo.daysStaked, // Not directly used now
          currentReward: stakingInfo.currentReward, // Keep fetched reward if needed elsewhere
          lastClaimTime: stakingInfo.lastClaimTime, // Add lastClaimTime here
          metadataFetched: false, // Needs implementation if fetching extra metadata
        };
      });
      
      console.log("NFTs with Staking Status (Before Filter):", nftsWithStakingStatus);

      const filteredStakedNfts = nftsWithStakingStatus.filter(nft => nft.isStaked);
      console.log("Filtered Staked NFTs:", filteredStakedNfts);

      setWalletNfts(nftsWithStakingStatus.filter(nft => !nft.isStaked));
      setStakedNfts(filteredStakedNfts);
      // Total rewards will be calculated by the useEffect hook based on stakedNfts

      console.log("Finished processing NFT data.");

    } catch (error) {
      console.error('Error fetching wallet data:', error)
        setError("Failed to load NFTs. Please try refreshing.");
    } finally {
      setIsLoading(false)
      setInitialLoading(false)
      isFetchingRef.current = false
    }
  }, [publicKey, connection, toast])

  // Effect for wallet connection/disconnection
  useEffect(() => {
    if (connected && publicKey) {
      if (!connectedRef.current) {
      connectedRef.current = true;
      checkWalletBalance();
        fetchWalletData();
      }
    } else {
      if (connectedRef.current) {
         connectedRef.current = false;
         setWalletNfts([]);
         setStakedNfts([]);
         setTotalRewards(BigInt(0));
         setInitialLoading(true); // Show loading on disconnect
         setError(null);
         setSelectedWalletNfts(new Set()); // Clear selection
      }
    }
  }, [connected, publicKey, fetchWalletData]); 

  // Check wallet balance function
  const checkWalletBalance = async () => {
    if (!publicKey || !connection) return;
    try {
      const hasSol = await hasEnoughSol(connection, publicKey);
      setHasSufficientBalance(hasSol);
      if (!hasSol) {
        toast({ title: "Low SOL Balance", variant: "destructive" });
      }
    } catch (error) { console.error('Error checking balance:', error); }
  }

  // Manual Refresh Handler
  const handleRefresh = useCallback(() => {
    if (!connected || !publicKey) return;
    console.log("Manual refresh triggered.");
    setError(null); 
    fetchWalletData();
    checkWalletBalance();
  }, [connected, publicKey, fetchWalletData]);

  // --- Action Handlers (Stake, Unstake, Claim, Claim All, Stake All) ---

  const handleStakeNft = async (nft: NFT) => {
      if (!publicKey || !connection || !signTransaction) return toast({ title: "Wallet not ready", variant: "destructive" });
    if (stakingInProgress) return;
    
      playSound(CLICK_SOUND_PATH, 0.5);
      setStakingInProgress(true);
      setLoadingStates(prev => ({ ...prev, [nft.mint]: true }));
      setSelectedNftMint(nft.mint);
      setError(null);

      try {
          const transaction = await createStakeNftTransaction(connection, publicKey, new PublicKey(nft.mint));
          const signature = await sendTransaction(transaction, connection, { publicKey, signTransaction });

          await playSuccessSound();
          setStakedSuccessMint(nft.mint);
          setTimeout(() => setStakedSuccessMint(null), 2500);

          toast({ title: "NFT Staked!", description: `Tx: ${signature.substring(0, 10)}...` });

          // Optimistic UI update
          setWalletNfts(prev => prev.filter(wNft => wNft.mint !== nft.mint));
          // Add to staked list optimistically (will be confirmed by fetch)
          setStakedNfts(prev => [...prev, { ...nft, isStaked: true, stakedAt: Date.now()/1000, lastClaimTime: Date.now()/1000 }]);


          await fetchWalletData(); // Refresh data

      } catch (error: any) {
          playSound(ERROR_SOUND_PATH, 0.5);
          console.error('Staking failed:', error);
          const errorMessage = error.message || 'Staking failed. Please try again.';
          toast({ title: "Staking Error", description: errorMessage, variant: "destructive" });
          setError(errorMessage);
      } finally {
          setStakingInProgress(false);
          setLoadingStates(prev => ({ ...prev, [nft.mint]: false }));
          setSelectedNftMint("");
      }
  };

  const handleUnstakeNft = async (nftMint: string) => {
      if (!publicKey || !connection || !signTransaction) return toast({ title: "Wallet not ready", variant: "destructive" });
      if (!hasSufficientBalance) return toast({ title: "Insufficient SOL", variant: "destructive" });
      if (unstakingInProgress) return;

      playSound(CLICK_SOUND_PATH, 0.3);
      setUnstakingInProgress(true);
      setSelectedNftMint(nftMint);
      setLoadingStates(prev => ({ ...prev, [nftMint]: true }));
      setError(null);

      try {
          const transaction = await createUnstakeNftTransaction(connection, publicKey, new PublicKey(nftMint));
          const signature = await sendTransaction(transaction, connection, { publicKey, signTransaction });

          playSound(SUCCESS_SOUND_PATH, 0.3);
          toast({ title: "NFT Unstaked!", description: `Tx: ${signature.substring(0, 10)}...` });

          await fetchWalletData(); // Refresh data
          setActiveTab('wallet'); // Switch tab

      } catch (error: any) {
          playSound(ERROR_SOUND_PATH, 0.3);
          console.error('Error unstaking NFT:', error);
          const errorMessage = error.message || 'Unstaking failed.';
          toast({ title: "Unstaking Error", description: errorMessage, variant: "destructive" });
          setError(errorMessage);
    } finally {
          setUnstakingInProgress(false);
          setSelectedNftMint("");
          setLoadingStates(prev => ({ ...prev, [nftMint]: false }));
    }
  };
  
  const handleClaimRewards = async (nftMint: string) => {
      if (!publicKey || !connection || !signTransaction) return toast({ title: "Wallet not ready", variant: "destructive" });
      if (!hasSufficientBalance) return toast({ title: "Insufficient SOL", variant: "destructive" });
      if (claimingInProgress) return;

      // Find the NFT to check live reward before claiming
      const nft = stakedNfts.find(n => n.mint === nftMint);
      if (!nft) return; // Should not happen

      // Calculate live reward to check if > 0
      const startTime = nft.lastClaimTime && nft.lastClaimTime > 0 ? nft.lastClaimTime : nft.stakedAt;
      if (!startTime) return toast({ title: "Cannot calculate reward", description: "Missing stake time.", variant: "destructive" });

      const nowSeconds = Date.now() / 1000;
      const elapsedSeconds = BigInt(Math.max(0, Math.floor(nowSeconds - startTime)));
      const currentAccruedReward = elapsedSeconds * REWARD_RATE_PER_SECOND_WITH_DECIMALS;

      if (currentAccruedReward <= BigInt(0)) {
          toast({ title: "No Rewards Yet", description: "Not enough time has passed to claim rewards." });
          return;
      }


      playSound(CLICK_SOUND_PATH, 0.3);
      setClaimingInProgress(true);
      setSelectedNftMint(nftMint);
      setLoadingStates(prev => ({ ...prev, [nftMint]: true }));
      setError(null);

      try {
          const transaction = await createClaimRewardsTransaction(connection, publicKey, new PublicKey(nftMint));
          const signature = await sendTransaction(transaction, connection, { publicKey, signTransaction });

          playSound(SUCCESS_SOUND_PATH, 0.3);
          toast({ title: "Rewards Claimed!", description: `Tx: ${signature.substring(0, 10)}...` });

          await fetchWalletData(); // Refresh data

      } catch (error: any) {
          playSound(ERROR_SOUND_PATH, 0.3);
          console.error('Error claiming rewards:', error);
          const errorMessage = error.message || 'Claiming rewards failed.';
          toast({ title: "Claiming Error", description: errorMessage, variant: "destructive" });
          setError(errorMessage);
    } finally {
          setClaimingInProgress(false);
          setSelectedNftMint("");
          setLoadingStates(prev => ({ ...prev, [nftMint]: false }));
    }
  };
  
  const handleClaimAllRewards = async () => {
      if (!publicKey || !connection || !signTransaction) return toast({ title: "Wallet not ready", variant: "destructive" });
      if (!hasSufficientBalance) return toast({ title: "Insufficient SOL", variant: "destructive" });
      if (claimingInProgress || unstakingInProgress || isClaimingAll) return;

      const eligibleNfts = stakedNfts.filter(nft => {
          const startTime = nft.lastClaimTime && nft.lastClaimTime > 0 ? nft.lastClaimTime : nft.stakedAt;
          if (!startTime) return false;
          const nowSeconds = Date.now() / 1000;
          const elapsedSeconds = BigInt(Math.max(0, Math.floor(nowSeconds - startTime)));
          const currentAccruedReward = elapsedSeconds * REWARD_RATE_PER_SECOND_WITH_DECIMALS;
          return currentAccruedReward > BigInt(0);
      });

    if (eligibleNfts.length === 0) {
          toast({ title: "No rewards to claim", description: "No NFTs have rewards ready." });
          return;
    }

    setIsClaimingAll(true);
    playSound(CLICK_SOUND_PATH, 0.3);
      toast({ title: "Starting Claim All...", description: `Claiming for ${eligibleNfts.length} NFTs.` });

    let successCount = 0;
    let failCount = 0;

    for (const nft of eligibleNfts) {
      try {
        setLoadingStates(prev => ({ ...prev, [nft.mint]: true })); 
        console.log(`Claiming rewards for ${nft.mint}...`);
              const transaction = await createClaimRewardsTransaction(connection, publicKey, new PublicKey(nft.mint));
        await sendTransaction(transaction, connection, { publicKey, signTransaction });
        successCount++;
      } catch (error: any) {
        failCount++;
        console.error(`Error claiming rewards for ${nft.mint}:`, error);
      } finally {
         setLoadingStates(prev => ({ ...prev, [nft.mint]: false }));
      }
          await new Promise(resolve => setTimeout(resolve, 500)); // Delay
    }

    playSound(successCount > 0 ? SUCCESS_SOUND_PATH : ERROR_SOUND_PATH, 0.3);
    toast({ 
      title: "Claim All Finished",
          description: `Success: ${successCount}, Failed: ${failCount}. Refreshing...`,
          variant: failCount > 0 ? "destructive" : "default"
    });

    await fetchWalletData(); 
    setIsClaimingAll(false);
  };
  
  const handleStakeAll = async () => {
      if (!publicKey || !connection || !signTransaction) return toast({ title: "Wallet not ready", variant: "destructive" });
      if (!hasSufficientBalance) return toast({ title: "Insufficient SOL", variant: "destructive" });
      if (isStakingAll || stakingInProgress) return;

    const nftsToStake = walletNfts.filter(nft => selectedWalletNfts.has(nft.mint));
    if (nftsToStake.length === 0) {
          toast({ title: "No NFTs selected" });
          return;
    }

    setIsStakingAll(true);
    playSound(CLICK_SOUND_PATH, 0.3);
      toast({ title: "Starting Stake Selected...", description: `Staking ${nftsToStake.length} NFTs.` });

    let successCount = 0;
    let failCount = 0;

    for (const nft of nftsToStake) {
      try {
        setLoadingStates(prev => ({ ...prev, [nft.mint]: true })); 
              console.log(`[StakeAll] Processing ${nft.mint}`);
              const transaction = await createStakeNftTransaction(connection, publicKey, new PublicKey(nft.mint));
        await sendTransaction(transaction, connection, { publicKey, signTransaction });
        successCount++;
              await playSuccessSound();
      } catch (error: any) {
        failCount++;
              console.error(`[StakeAll] Error staking ${nft.mint}:`, error);
      } finally {
         setLoadingStates(prev => ({ ...prev, [nft.mint]: false }));
      }
          await new Promise(resolve => setTimeout(resolve, 500)); // Delay
    }

    playSound(successCount > 0 ? SUCCESS_SOUND_PATH : ERROR_SOUND_PATH, 0.3);
    toast({ 
          title: "Stake Selected Finished",
          description: `Success: ${successCount}, Failed: ${failCount}. Refreshing...`,
          variant: failCount > 0 ? "destructive" : "default"
      });

    await fetchWalletData(); 
    setIsStakingAll(false);
      setSelectedWalletNfts(new Set()); // Clear selection
      if (successCount > 0) setActiveTab('staked');
  };


  // Format time helper
  const formatTimeAgo = (timestamp?: number): string => {
      if (!timestamp) return "Unknown";
      const now = Math.floor(Date.now() / 1000);
      const secondsAgo = now - timestamp;
      if (secondsAgo < 60) return `${secondsAgo}s ago`;
      if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
      if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
      return `${Math.floor(secondsAgo / 86400)}d ago`;
  };

  // --- NFT Card Component ---
  type NftCardProps = {
    nft: StakedNFT;
    isStaked?: boolean;
    isSelected?: boolean;
    onSelect?: (mint: string) => void;
      stakedSuccessMint: string | null; // Pass state for visual feedback
  };

  const NftCard = React.memo(({
      nft,
      isStaked = false,
      isSelected = false,
      onSelect,
      stakedSuccessMint
  }: NftCardProps) => {
      // Removed unused connection/publicKey from here, use props/handlers
      const [imageUrl, setImageUrl] = useState<string | null>(nft.image || '/images/pookie_load.gif');
    const [imageError, setImageError] = useState(false);
    const [imageLoaded, setImageLoaded] = useState(false);
      const [currentAttemptIndex, setCurrentAttemptIndex] = useState(0);
      const [liveReward, setLiveReward] = useState<bigint>(BigInt(0));
      const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

      // Derive possible image URLs only once
    const possibleImageUrls = useMemo(() => {
      const urls = [nft.image];
          if (nft.alternativeImageUrls) urls.push(...nft.alternativeImageUrls);
          // Add hardcoded fallback if needed, e.g., Arweave or generic Pookie image
          urls.push(`https://arweave.net/DuHCK6NWnzZKUfNbTDvLMnkXKsZbD6iOaG3DDkXj3rs`); // Example fallback
          urls.push('/images/pookie_load.gif'); // Final fallback
          return Array.from(new Set(urls.filter(Boolean))); // Unique & non-null
      }, [nft.image, nft.alternativeImageUrls]);

      // Effect to set the initial image URL
      useEffect(() => {
          setImageUrl(possibleImageUrls[0]);
          setImageError(false);
          setImageLoaded(false);
          setCurrentAttemptIndex(0);
      }, [possibleImageUrls]); // Rerun if NFT changes fundamentally

      // Image error handling with fallback logic
      const handleImageError = useCallback(() => {
          console.log(`Image failed: ${possibleImageUrls[currentAttemptIndex]} for ${nft.name}`);
          const nextIndex = currentAttemptIndex + 1;
          if (nextIndex < possibleImageUrls.length) {
              console.log(`Trying next image: ${possibleImageUrls[nextIndex]}`);
              setCurrentAttemptIndex(nextIndex);
              setImageUrl(possibleImageUrls[nextIndex]); // Set next URL to try
              setImageLoaded(false); // Reset loaded state for the new URL
          } else {
              console.log(`Exhausted all image URLs for ${nft.name}`);
              setImageError(true); // Mark as error after trying all
              setImageLoaded(true); // Stop loading indicator even on error
          }
      }, [currentAttemptIndex, possibleImageUrls, nft.name]);

      // Live reward calculation effect
      useEffect(() => {
          if (!isStaked || !publicKey) { // Need publicKey check here too
              setLiveReward(BigInt(0));
              return;
          }

          const calculateLiveReward = () => {
              const startTime = nft.lastClaimTime && nft.lastClaimTime > 0 ? nft.lastClaimTime : nft.stakedAt;
              if (!startTime) return; // Do nothing if no start time

              const nowSeconds = Date.now() / 1000;
              const elapsedSeconds = BigInt(Math.max(0, Math.floor(nowSeconds - startTime)));
              const currentAccruedReward = elapsedSeconds * REWARD_RATE_PER_SECOND_WITH_DECIMALS;
              setLiveReward(currentAccruedReward);
          };

          calculateLiveReward(); // Initial calculation
          const intervalId = setInterval(calculateLiveReward, 1000); // Update every second
          return () => clearInterval(intervalId); // Cleanup

      }, [isStaked, nft.stakedAt, nft.lastClaimTime, publicKey]); // Added publicKey dependency

      // Effect to show success overlay
      useEffect(() => {
          if (stakedSuccessMint === nft.mint) {
              setShowSuccessOverlay(true);
              const timer = setTimeout(() => setShowSuccessOverlay(false), 2500); // Duration of overlay
              return () => clearTimeout(timer);
          } else {
            setShowSuccessOverlay(false); // Ensure it's off otherwise
          }
      }, [stakedSuccessMint, nft.mint]);


      // Handle card click for selection
    const handleCardClick = () => {
      if (!isStaked && onSelect) { // Only allow selection on wallet NFTs
        onSelect(nft.mint);
      }
    };

      // Memoized formatted reward
      const formattedLiveReward = useMemo(() => {
          return (Number(liveReward) / (10 ** POOKIE_DECIMALS)).toFixed(4);
      }, [liveReward]);

      // Loading states for buttons
      const isActionLoading = loadingStates[nft.mint] || false;
      const isStakingThis = isActionLoading && selectedNftMint === nft.mint && stakingInProgress;
      const isUnstakingThis = isActionLoading && selectedNftMint === nft.mint && unstakingInProgress;
      const isClaimingThis = isActionLoading && selectedNftMint === nft.mint && claimingInProgress;
      // General loading affects dimming/interactions
      const generalLoading = isActionLoading || isClaimingAll || isStakingAll;


    return (
          <motion.div
              layout // Animate layout changes (e.g., moving between tabs)
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className={cn("relative", generalLoading && "opacity-50 pointer-events-none")} // Dim card when general loading
          >
      <Card 
        className={cn(
                      "relative overflow-hidden bg-card/50 hover:bg-card/80 transition-all duration-200 h-full flex flex-col",
                      !isStaked && "cursor-pointer", // Pointer only for wallet cards
                      isSelected && "ring-2 ring-primary ring-offset-2 ring-offset-background" // Selection ring
                  )}
                  onClick={handleCardClick}
              >
                  <CardHeader className="p-0 relative">
                      {/* Image Container */}
                      <div className="aspect-square relative overflow-hidden">
                          {/* Loading Skeleton */}
                          {!imageLoaded && !imageError && (
                              <Skeleton className="absolute inset-0 w-full h-full" />
                          )}
                          {/* Image */}
            <Image
                              data-nft-card-image=""
                              key={imageUrl} // Force re-render if URL changes
                              src={imageUrl || '/images/pookie_load.gif'} // Fallback to placeholder
                              alt={nft.name || 'Pookie NFT'}
                              layout="fill"
                              objectFit="cover"
                              className={`transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                              onLoad={() => { console.log(`Image loaded: ${imageUrl}`); setImageLoaded(true); setImageError(false); }}
              onError={handleImageError}
                              unoptimized={true} // If using external URLs like Arweave/IPFS often
                          />
                          {/* Loading/Action Overlay */}
                          {isActionLoading && (
                              <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            )}
                          {/* Staked Success Overlay */}
                           <AnimatePresence>
                              {showSuccessOverlay && (
                                  <motion.div
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      exit={{ opacity: 0 }}
                                      className="absolute inset-0 bg-green-500/80 flex flex-col items-center justify-center text-white font-bold text-center p-2"
                                  >
                                      <p className="text-lg">Staked! ✅</p>
                                  </motion.div>
                              )}
                          </AnimatePresence>
          </div>

                      {/* Info Overlays */}
                      {isStaked && nft.stakedAt && (
                          <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center shadow-md">
                              <ClockIcon className="w-2.5 h-2.5 mr-1" />
                              Staked: {formatTimeAgo(nft.stakedAt)}
              </div>
                      )}
                      {isStaked && (
                          <div className="absolute bottom-1 right-1 bg-primary/80 text-primary-foreground text-[10px] px-1.5 py-0.5 rounded flex items-center shadow-md backdrop-blur-sm">
                              <CoinsIcon className="w-2.5 h-2.5 mr-1" />
                              Rewards: {formattedLiveReward}
              </div>
                      )}
                  </CardHeader>

                  <CardContent className="p-3 flex-grow">
                      <p className="font-semibold text-sm truncate">{nft.name || 'Pookie NFT'}</p>
                      {/* Optional: Add description if available */}
                      {/* <p className="text-xs text-muted-foreground truncate">{nft.description || ''}</p> */}
                  </CardContent>

                  <CardFooter className="p-3 pt-0">
                      {isStaked ? (
                          // --- Staked Buttons ---
                          <div className="flex gap-2 w-full">
                              <Button
                                  variant="secondary"
                                  size="sm"
                                  className="flex-1"
                                  disabled={isActionLoading || isUnstakingThis || isClaimingThis || BigInt(liveReward) <= BigInt(0)} // Disable if no reward
                                  onClick={(e) => { e.stopPropagation(); handleClaimRewards(nft.mint); }} // Prevent card selection click
                              >
                                  {isClaimingThis ? 'Claiming...' : 'Claim'}
                              </Button>
              <Button 
                variant="destructive" 
                size="sm"
                                  className="flex-1"
                                  disabled={isActionLoading || isUnstakingThis || isClaimingThis}
                                  onClick={(e) => { e.stopPropagation(); handleUnstakeNft(nft.mint); }} // Prevent card selection click
                              >
                                  {isUnstakingThis ? 'Unstaking...' : 'Unstake'}
              </Button>
                          </div>
          ) : (
                          // --- Unstaked Button ---
            <Button 
              variant="default" 
              size="sm"
              className="w-full"
                              disabled={isActionLoading || isStakingThis}
                              onClick={(e) => {
                                  e.stopPropagation(); // Prevent card selection click if button is clicked
                                  handleStakeNft(nft);
                              }}
                          >
                              {isStakingThis ? 'Staking...' : 'Stake NFT'}
            </Button>
          )}
        </CardFooter>
      </Card>
          </motion.div>
    );
  });
  NftCard.displayName = 'NftCard'; // Add display name for debugging


  // --- Main Render Logic ---

  // Render NFT Grid component
  const renderNftGrid = (nfts: StakedNFT[], isStakedTab = false) => {
    if (!connected) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <WalletIcon className="w-12 h-12 text-muted-foreground mb-4" />
           <p className="text-muted-foreground mb-4">Connect your wallet to view and stake your Pookie NFTs.</p>
           <WalletMultiButton className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md" />
        </div>
      );
    }

    if (initialLoading) {
      return ( // Skeleton Loader Grid
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => ( // Show more skeletons initially
            <Card key={i} className="bg-card/50 animate-pulse">
              <CardHeader className="p-4"><Skeleton className="h-4 w-3/4" /></CardHeader>
              <CardContent className="p-0"><Skeleton className="aspect-square" /></CardContent>
              <CardFooter className="p-4"><Skeleton className="h-8 w-full" /></CardFooter>
            </Card>
          ))}
        </div>
      );
    }

    if (error) {
      return <p className="text-red-500 text-center p-4">{error}</p>;
    }

    if (nfts.length === 0) {
      return ( // Empty State Message
        <div className="flex flex-col items-center justify-center p-8 text-center">
           {isStakedTab ? (
             <><CoinsIcon className="w-12 h-12 text-muted-foreground mb-4" /><p className="text-muted-foreground">No NFTs currently staked.</p></>
           ) : (
             <><AlertTriangleIcon className="w-12 h-12 text-muted-foreground mb-4" /><p className="text-muted-foreground">No eligible Pookie NFTs found in your wallet.</p></>
          )}
        </div>
      );
    }

    // Actual NFT Grid
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {nfts.map((nft) => (
          <NftCard 
            key={nft.mint} 
            nft={nft} 
            isStaked={isStakedTab}
            isSelected={!isStakedTab && selectedWalletNfts.has(nft.mint)}
            onSelect={!isStakedTab ? handleSelectNft : undefined} // Only allow selection in wallet tab
            stakedSuccessMint={stakedSuccessMint}
          />
        ))}
      </div>
    );
  };

  // Handler for selecting/deselecting an NFT in the wallet tab
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
      setSelectedWalletNfts(new Set()); // Deselect all
    } else {
      setSelectedWalletNfts(new Set(walletNfts.map(nft => nft.mint))); // Select all
    }
  };

  // Format total rewards with decimals
  const formattedTotalRewards = useMemo(() => {
      return (Number(totalRewards) / (10 ** POOKIE_DECIMALS)).toFixed(4);
  }, [totalRewards]);

  // --- JSX Return for the main component ---
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => { // Enhanced reset logic
         setError(null);
         setInitialLoading(true); // Re-trigger initial loading state
         isFetchingRef.current = false;
         if (connected && publicKey) fetchWalletData(); // Refetch on reset
      }}
    >
      <div className="space-y-6 w-full max-w-7xl mx-auto"> {/* Constrain width */}
        <div className="flex justify-between items-center">
          {/* Title moved or removed - assumed to be handled by parent page */}
          {/* <h2 className="text-2xl font-bold">NFT Staking</h2> */}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={initialLoading || isLoading || !connected}
            className="ml-auto" // Align refresh button to the right if title is removed
          >
            <RefreshCwIcon size={16} className={`mr-2 ${(initialLoading || isLoading) ? 'animate-spin' : ''}`} /> 
            Refresh
          </Button>
        </div>
        
        {/* Stats Panel - Only show if connected and NFTs are staked */}
        {connected && stakedNfts.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-background/60 border border-primary/20 rounded-lg p-4 mb-4 shadow-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Staked NFTs</p>
                 <p className="text-2xl font-bold text-primary">{stakedNfts.length}</p>
              </div>
              <div className="space-y-1">
                 <p className="text-sm text-muted-foreground">Live Rewards</p>
                 {/* Display formatted total */}
                 <p className="text-2xl font-bold text-primary">{formattedTotalRewards}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Daily Earnings</p>
                 <p className="text-2xl font-bold text-primary">{stakedNfts.length * DAILY_REWARD_RATE_TOKENS}</p>
              </div>
              <div className="space-y-1">
                 <p className="text-sm text-muted-foreground">Rate / NFT</p>
                 <p className="text-2xl font-bold text-primary">{DAILY_REWARD_RATE_TOKENS} / day</p>
              </div>
            </div>
            {/* Claim All Button */}
            <div className="mt-6 flex justify-center">
              <Button
                onClick={handleClaimAllRewards}
                disabled={!connected || isClaimingAll || totalRewards <= BigInt(0)} // Check BigInt total
                size="lg"
                className="bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-md hover:scale-105 transition-transform"
              >
                {isClaimingAll ? (
                  <><RefreshCwIcon className="mr-2 h-4 w-4 animate-spin" />Claiming...</>
                ) : (
                  `Claim All Rewards (${formattedTotalRewards} $POOKIE)`
                )}
              </Button>
            </div>
          </motion.div>
        )}
        
        {/* Tabs for Wallet/Staked NFTs */}
        <Tabs defaultValue="wallet" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 w-full mb-4">
            <TabsTrigger value="wallet">
               Wallet NFTs ({walletNfts.length})
            </TabsTrigger>
            <TabsTrigger value="staked">
               Staked NFTs ({stakedNfts.length})
            </TabsTrigger>
          </TabsList>
          
          {/* Buttons Row for Wallet Tab */}
          {activeTab === 'wallet' && connected && walletNfts.length > 0 && (
            <div className="mb-4 flex justify-center items-center gap-4">
                    <Button
                      onClick={handleToggleSelectAllWallet}
                      disabled={!connected || walletNfts.length === 0}
                      size="lg"
                      variant="outline" 
                    >
                   {selectedWalletNfts.size === walletNfts.length && walletNfts.length > 0 ? "Deselect All" : "Select All"}
                    </Button>
                    <Button
                   onClick={handleStakeAll}
                   disabled={!connected || isStakingAll || selectedWalletNfts.size === 0}
                      size="lg"
                   className="bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-md hover:scale-105 transition-transform"
                    >
                      {isStakingAll ? (
                       <><RefreshCwIcon className="mr-2 h-4 w-4 animate-spin" />Staking...</>
                      ) : (
                        `Stake Selected (${selectedWalletNfts.size})`
                      )}
                    </Button>
                  </div>
                )}

          {/* Tab Content with Animation */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-0" // Remove margin top if buttons are above
            >
              {/* Add scroll container with defined height */}
              <div className="max-h-[60vh] overflow-y-auto pr-2 rounded-lg custom-scrollbar">
                {/* Render Content based on Active Tab */}
                 {activeTab === 'wallet' && renderNftGrid(walletNfts, false)}
                 {activeTab === 'staked' && renderNftGrid(stakedNfts, true)}
                </div>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </div>
    </ErrorBoundary>
  )
} 