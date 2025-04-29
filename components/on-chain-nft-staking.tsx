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
import { fetchNFTsForWallet, NFT } from '@/utils/solana-nft'
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

// Sound paths
const CLICK_SOUND_PATH = '/sounds/click-sound.wav'
const SUCCESS_SOUND_PATH = '/sounds/success-sound.wav'
const ERROR_SOUND_PATH = '/sounds/error-sound.wav'

// NFT staking interface with additional staking data
interface StakedNFT extends NFT {
  isStaked: boolean
  stakedAt?: number
  daysStaked?: number
  currentReward?: number
}

// Error Fallback component for error boundary
const ErrorFallback = ({ error, resetErrorBoundary }) => (
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
  
  const refreshTimer = useRef<NodeJS.Timeout | null>(null)
  const connectedRef = useRef<boolean>(false)

  // Update refs when wallet state changes
  useEffect(() => {
    if (connected && publicKey) {
      connectedRef.current = true
      setInitialLoading(true)
      checkWalletBalance()
      fetchWalletData()
    }
  }, [connected, publicKey])

  // Reset state on disconnect
  useEffect(() => {
    if (!connected && connectedRef.current) {
      // Wallet was disconnected
      connectedRef.current = false
      setWalletNfts([])
      setStakedNfts([])
      setTotalRewards(0)
      setInitialLoading(false)
    }
  }, [connected])

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
          variant: "warning",
        })
      }
    } catch (error) {
      console.error('Error checking wallet balance:', error)
    }
  }

  // Fetch wallet NFTs and check staking status
  const fetchWalletData = async () => {
    if (!publicKey) return
    
    setError(null)
    setInitialLoading(true)
    try {
      // Fetch NFTs in wallet
      const walletAddress = publicKey.toString()
      const nfts = await fetchNFTsForWallet(walletAddress)
      
      if (nfts.length === 0) {
        setInitialLoading(false)
        setIsLoading(false)
        return
      }
      
      // Check staking status for each NFT
      const nftsWithStakingStatus: StakedNFT[] = await Promise.all(
        nfts.map(async (nft) => {
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
            }
          } catch (error) {
            console.error('Error getting staking info:', error)
            return {
              ...nft,
              isStaked: false
            }
          }
        })
      )
      
      // Separate staked and unstaked NFTs
      const staked: StakedNFT[] = nftsWithStakingStatus.filter(nft => nft.isStaked)
      const unstaked: StakedNFT[] = nftsWithStakingStatus.filter(nft => !nft.isStaked)
      
      setWalletNfts(unstaked)
      setStakedNfts(staked)
      
      // Calculate total rewards
      const total = staked.reduce((sum, nft) => sum + (nft.currentReward || 0), 0)
      setTotalRewards(total)
    } catch (error) {
      console.error('Error fetching wallet data:', error)
      setError('Failed to load NFT data. Please try again.')
      toast({
        title: "Error loading NFTs",
        description: "Failed to load your NFTs. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
      setInitialLoading(false)
    }
  }
  
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
  
  // Handle refresh
  const handleRefresh = () => {
    fetchWalletData()
    checkWalletBalance()
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
    const isLoading = loadingStates[nft.mint] || false
    
    return (
      <Card className="bg-background/60 border border-primary/20 overflow-hidden hover:border-primary/60 transition-all duration-300 group">
        <CardContent className="p-3">
          <div className="relative aspect-square rounded-lg overflow-hidden mb-2">
            <Image
              src={nft.image}
              alt={nft.name}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-110"
              priority
            />
            
            {isStaked && (
              <div className="absolute top-2 right-2 bg-primary text-xs py-1 px-2 rounded-full text-primary-foreground">
                Staked
              </div>
            )}
          </div>
          
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
        </CardContent>
      </Card>
    )
  }
  
  // Render NFT grid with loading states
  const renderNftGrid = (nfts: StakedNFT[], isStaked = false, isLoading = false) => {
    if (initialLoading) {
      return (
        <div className="py-10 flex flex-col items-center justify-center">
          <RefreshCwIcon size={40} className="animate-spin text-primary/50 mb-4" />
          <p className="text-center text-muted-foreground">Loading NFTs and staking data...</p>
        </div>
      )
    }
    
    if (isLoading) {
      return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-36 w-full rounded-lg" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      )
    }
    
    if (!connected) {
      return (
        <div className="py-12 flex flex-col items-center justify-center">
          <WalletIcon size={40} className="text-primary/50 mb-4" />
          <p className="text-muted-foreground mb-4">Connect your wallet to view and stake your NFTs</p>
          <p className="text-xs text-muted-foreground/70 max-w-sm text-center">
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
                Stake your NFTs to start earning $POOKIE rewards
              </p>
            </>
          ) : (
            <>
              <CoinsIcon size={40} className="text-primary/50 mb-4" />
              <p className="text-muted-foreground">No NFTs found in your wallet</p>
              <p className="text-xs text-muted-foreground/70 mt-2">
                Purchase Pookie NFTs to stake them and earn rewards
              </p>
            </>
          )}
        </div>
      )
    }
    
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
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
  
  // Clean up function
  const cleanUp = () => {
    if (refreshTimer.current) {
      clearInterval(refreshTimer.current)
    }
  }

  // Initial load and refresh on wallet change/refreshTrigger
  useEffect(() => {
    fetchWalletData()
    
    // Set up periodic refresh (every 30 seconds)
    refreshTimer.current = setInterval(() => {
      fetchWalletData()
    }, 30000)
    
    return cleanUp
  }, [publicKey, refreshTrigger, fetchWalletData])

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        setIsLoading(false)
        setStakingInProgress(false)
        setUnstakingInProgress(false) 
        setClaimingInProgress(false)
        setSelectedNftMint("")
        setError(null)
        
        if (connected && publicKey) {
          fetchWalletData()
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
            disabled={isLoading || !connected}
          >
            <RefreshCwIcon size={16} className={`mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        
        {!hasSufficientBalance && connected && (
          <div className="bg-warning/10 border border-warning text-warning p-3 rounded-lg mb-2 text-sm flex items-center">
            <AlertTriangleIcon size={16} className="mr-2 flex-shrink-0" />
            <span>Your wallet has insufficient SOL for transactions. Please add more SOL to continue.</span>
          </div>
        )}
        
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