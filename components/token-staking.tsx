"use client"

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { 
  Connection, 
  PublicKey, 
  Transaction, 
  LAMPORTS_PER_SOL 
} from '@solana/web3.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/components/ui/use-toast'
import { playClickSound, playSound } from '@/hooks/use-audio'
import { supabase } from '@/utils/supabase-client'
import { motion } from 'framer-motion'
import { Unlock, AlertCircle, Clock, CircleCheckBig, CircleX, Flame, WarningCircle } from 'lucide-react'
import { 
  calculateTokens, 
  formatTokenAmount 
} from '@/utils/token-supply'
import { Progress } from "@/components/ui/progress"

// Sound path
const CLICK_SOUND_PATH = '/sounds/click.mp3'
const SUCCESS_SOUND_PATH = '/sounds/success-sound.wav'

// Solana RPC URL
const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

// Staking bonus schedule based on days
const STAKING_BONUSES = [
  { days: 1, bonus: 5 },
  { days: 3, bonus: 15 },
  { days: 5, bonus: 30 },
  { days: 7, bonus: 50 },
]

// Helper function to format token amounts
const formatTokenAmount = (amount: number): string => {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(2)}M`;
  } else if (amount >= 1000) {
    return `${(amount / 1000).toFixed(2)}K`;
  } else {
    return amount.toFixed(2);
  }
};

// Calculate bonus percentage based on vesting days
const calculateBonusPercentage = (days: number): number => {
  if (days >= 365) return 50;
  if (days >= 180) return 30;
  if (days >= 90) return 20;
  if (days >= 30) return 10;
  return 5;
};

export default function TokenStaking() {
  const { connected, publicKey } = useWallet()
  const [stakingAmount, setStakingAmount] = useState<number>(0)
  const [stakingDays, setStakingDays] = useState<number>(1)
  const [bonusPercentage, setBonusPercentage] = useState<number>(5)
  const [bonusTokens, setBonusTokens] = useState<number>(0)
  const [totalTokens, setTotalTokens] = useState<number>(0)
  const [isStaking, setIsStaking] = useState<boolean>(false)
  const [userContribution, setUserContribution] = useState<number>(0)
  const [stakedAmount, setStakedAmount] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  
  // Track vested tokens for claiming
  const [isClaiming, setIsClaiming] = useState<boolean>(false)
  const [vestedTokens, setVestedTokens] = useState<Array<{
    id: number;
    amount: number;
    vestingEndDate: string;
    isClaimable: boolean;
  }>>([])
  const [claimableAmount, setClaimableAmount] = useState<number>(0)
  const [claimableVestingPeriods, setClaimableVestingPeriods] = useState<Array<{
    id: number;
    amount: number;
    vestingEndDate: string;
    bonus: number;
  }>>([])
  
  // Calculate bonus percentage based on days
  useEffect(() => {
    const bonus = STAKING_BONUSES.find(b => b.days === stakingDays)?.bonus || 0
    setBonusPercentage(bonus)
  }, [stakingDays])
  
  // Calculate bonus tokens and total
  useEffect(() => {
    const { bonusTokens, totalTokens } = calculateTokens(stakingAmount, bonusPercentage)
    setBonusTokens(bonusTokens)
    setTotalTokens(totalTokens)
  }, [stakingAmount, bonusPercentage])
  
  // Fetch user contribution and staked amount
  const fetchUserData = async () => {
    if (!publicKey) {
      setIsLoading(false);
      return;
      }
      
      try {
      setIsLoading(true);
      
      // Fetch the user's contribution
      const { data: contributionData, error: contributionError } = await supabase
        .from('contributions')
        .select('amount')
          .eq('wallet_address', publicKey.toString())
        .maybeSingle();
      
      if (contributionError) {
        console.error('Error fetching user contribution:', contributionError);
      }
      
      // Fetch the user's staked amount
      const { data: stakingData, error: stakingError } = await supabase
        .from('staked_tokens')
          .select('amount')
          .eq('wallet_address', publicKey.toString())
        .maybeSingle();
      
      if (stakingError) {
        console.error('Error fetching staked amount:', stakingError);
      }
      
      // Set the contribution and staked amount
      setUserContribution(contributionData?.amount || 0);
      setStakedAmount(stakingData?.amount || 0);
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Load user data when wallet is connected
  useEffect(() => {
    if (connected && publicKey) {
      fetchUserData();
      fetchVestedTokens();
    } else {
      // Reset states when wallet is disconnected
      setUserContribution(0);
      setStakedAmount(0);
      setVestedTokens([]);
      setClaimableAmount(0);
      setClaimableVestingPeriods([]);
      setIsLoading(false);
    }
  }, [connected, publicKey]);
  
  // Handle staking
  const handleStake = async () => {
    if (!connected || !publicKey) {
      toast({ 
        title: "Wallet not connected", 
        description: "Please connect your wallet to stake tokens", 
        variant: "destructive"
      })
      return
    }
    
    if (stakingAmount <= 0) {
      toast({ 
        title: "Invalid amount", 
        description: "Please enter a valid staking amount", 
        variant: "destructive"
      })
      return
    }
    
    if (stakingAmount > userContribution - stakedAmount) {
      toast({ 
        title: "Exceeds available amount", 
        description: "You cannot stake more than your available contribution", 
        variant: "destructive"
      })
      return
    }
    
    // Show token contract message
    toast({
      title: "Staking not available yet",
      description: "Staking will be enabled once the $POOKIE token contract is deployed",
    })
    
    // Uncomment this in production when token contract is available
    /*
    try {
      setIsStaking(true)
      playSound(CLICK_SOUND_PATH, 0.3)
      
      // In a real implementation, this would involve creating a staking transaction
      // on Solana blockchain. For now, we're just recording the stake in Supabase.
      
      // Record staking in Supabase
      const { error } = await supabase.from('staking_records').insert({
        wallet_address: publicKey.toString(),
        amount: stakingAmount,
        days: stakingDays,
        bonus_percentage: bonusPercentage,
        unlock_date: new Date(Date.now() + (stakingDays * 24 * 60 * 60 * 1000)),
        status: 'active'
      })
      
      if (error) throw error
      
      // Play success sound
      playSound(SUCCESS_SOUND_PATH, 0.3)
      
      // Show success message
      toast({
        title: "Staking successful!",
        description: `You've staked ${stakingAmount} tokens for ${stakingDays} days with a ${bonusPercentage}% bonus.`,
      })
      
      // Update local state
      setStakedAmount(prev => prev + stakingAmount)
      setStakingAmount(0)
      
    } catch (error) {
      console.error("Staking error:", error)
      toast({
        title: "Staking failed",
        description: error instanceof Error ? error.message : "Please try again later",
        variant: "destructive"
      })
    } finally {
      setIsStaking(false)
    }
    */
  }
  
  // Simulate vested tokens data - in production this would come from the database
  useEffect(() => {
    // Only set dummy data if wallet is connected
    if (publicKey) {
      setVestedTokens(1250) // Example amount
      setClaimableVestingPeriods([
        {
          id: 1,
          amount: 750,
          vestingEndDate: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          bonus: 5
        },
        {
          id: 2,
          amount: 500,
          vestingEndDate: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
          bonus: 10
        }
      ])
    }
  }, [publicKey])
  
  // Get vested tokens for the user
  const fetchVestedTokens = async () => {
    if (!publicKey) return;
    
    try {
      const { data, error } = await supabase
        .from('contributions')
        .select('id, amount, vesting_days, vesting_end_date, claimed_at')
        .eq('wallet_address', publicKey.toString())
        .is('vesting_end_date', 'not.null');
      
      if (error) {
        console.error('Error fetching vested tokens:', error);
        return;
      }
      
      if (!data || data.length === 0) {
        setVestedTokens([]);
        setClaimableAmount(0);
        return;
      }
      
      const now = new Date();
      const processedTokens = data.map(item => {
        const vestingEnd = new Date(item.vesting_end_date);
        const isClaimable = vestingEnd <= now && !item.claimed_at;
        
        // Calculate token amount (contribution amount converted to tokens with bonus)
        // Assuming 1 SOL = 1000 POOKIE tokens as a placeholder, adjust as needed
        const conversionRate = 1000;
        const bonusPercentage = calculateBonusPercentage(item.vesting_days);
        const baseAmount = item.amount * conversionRate;
        const bonusAmount = baseAmount * (bonusPercentage / 100);
        const totalAmount = baseAmount + bonusAmount;
        
        return {
          id: item.id,
          amount: totalAmount,
          vestingEndDate: item.vesting_end_date,
          isClaimable,
        };
      });
      
      setVestedTokens(processedTokens);
      
      // Calculate total claimable amount
      const claimableTokens = processedTokens
        .filter(token => token.isClaimable)
        .reduce((sum, token) => sum + token.amount, 0);
      
      setClaimableAmount(claimableTokens);
    } catch (error) {
      console.error('Error in fetchVestedTokens:', error);
    }
  };
  
  const handleClaimVestedTokens = async (contributionId: number) => {
    if (!publicKey || isClaiming) return;
    
    try {
      setIsClaiming(true);
      
      // Call the claim API endpoint
      const response = await fetch('/api/vesting/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: publicKey.toString(),
          contributionId,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to claim tokens');
      }
      
      toast({
        title: "Tokens Claimed Successfully!",
        description: `${result.data.amount.toFixed(2)} POOKIE tokens have been sent to your wallet.`,
        variant: "success",
        duration: 5000,
      });
      
      // Refresh vested tokens data
      fetchVestedTokens();
      
    } catch (error) {
      console.error('Error claiming tokens:', error);
      toast({
        title: "Failed to Claim Tokens",
        description: error instanceof Error ? error.message : "Please try again later",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsClaiming(false);
    }
  };
  
  // Format the displayed wallet address for better UX
  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  };
  
  // Reset loading state if taking too long
  useEffect(() => {
    // Set a timeout to prevent endless loading
    if (isLoading) {
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 5000); // 5 second timeout
      
      return () => clearTimeout(timer);
    }
  }, [isLoading]);
  
  // Handle staking amount input
  const handleStakingAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    if (isNaN(value) || value < 0) {
      setStakingAmount(0)
    } else {
      // Ensure staking amount doesn't exceed available contribution
      const availableToStake = userContribution - stakedAmount
      setStakingAmount(Math.min(value, availableToStake))
    }
  }
  
  // Handle staking form submission
  const handleStakeTokens = async () => {
    if (!publicKey || stakingAmount <= 0 || isStaking) return;
    
    try {
      setIsStaking(true);
      
      // Calculate token amounts
      const tokenAmount = stakingAmount * 1000; // Assuming 1 SOL = 1000 POOKIE
      const bonusAmount = tokenAmount * (bonusPercentage / 100);
      
      // Call the stake API endpoint
      const response = await fetch('/api/staking/stake', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          walletAddress: publicKey.toString(),
          amount: stakingAmount,
          vestingDays: stakingDays,
        }),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Failed to stake tokens');
      }
      
      // Play success sound
      playClickSound(0.3)
      
      toast({
        title: "Staking Successful!",
        description: `You've staked ${stakingAmount} SOL for ${stakingDays} days with a ${bonusPercentage}% bonus.`,
        variant: "success",
        duration: 5000,
      });
      
      // Refresh user data
      fetchUserData();
      fetchVestedTokens();
      
      // Reset staking form
      setStakingAmount(0);
      
    } catch (error) {
      console.error('Error staking tokens:', error);
      
      toast({
        title: "Staking Failed",
        description: error instanceof Error ? error.message : "Please try again later",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsStaking(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-48 mb-10">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        <p className="mt-4 text-primary">Loading staking data...</p>
      </div>
    )
  }
  
  if (!connected) {
    return (
      <div className="flex flex-col items-center justify-center w-full mb-10">
        <div className="p-6 rounded-lg bg-background/50 backdrop-blur-md border border-primary/30 text-center max-w-md">
          <h2 className="text-2xl font-bold text-primary mb-4">Connect Your Wallet</h2>
          <p className="mb-6 text-white/80">Connect your wallet to view your staking options and rewards.</p>
        </div>
      </div>
    )
  }
  
  if (userContribution === 0) {
    return (
      <div className="text-center py-8">
        <h3 className="text-xl font-bold text-primary mb-4">No Contribution Found</h3>
        <p className="mb-4">You don't have any presale contribution to stake. Please contribute to the presale first.</p>
        <Button 
          onClick={() => window.location.href = '/'}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Go to Presale
        </Button>
      </div>
    )
  }
  
  return (
    <div className="w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* User Dashboard */}
        <div className="p-6 rounded-lg bg-background/50 backdrop-blur-md border border-primary/30 w-full">
          <h3 className="text-xl font-bold text-primary mb-4">Your Dashboard</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-white/80">Wallet</span>
              <span className="font-mono text-white">{formatAddress(publicKey?.toString() || '')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/80">Total Contribution</span>
              <span className="font-bold text-white">{userContribution.toFixed(2)} SOL</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/80">Staked Amount</span>
              <span className="font-bold text-white">{stakedAmount.toFixed(2)} SOL</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/80">Available to Stake</span>
              <span className="font-bold text-white">{Math.max(0, userContribution - stakedAmount).toFixed(2)} SOL</span>
            </div>
          </div>
          
          {/* Disclaimer notice about allocations */}
          <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-600/30 rounded-md">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-200">
                <span className="font-semibold">Note:</span> Token allocations shown are estimations and might not be exactly accurate on launch day.
              </p>
            </div>
          </div>
        </div>
        
        {/* Vested Tokens */}
        <div className="p-6 rounded-lg bg-background/50 backdrop-blur-md border border-primary/30 w-full">
          <h3 className="text-xl font-bold text-primary mb-4">Your Vested Tokens</h3>
          {vestedTokens.length > 0 ? (
            <div className="space-y-4">
              {vestedTokens.map((token, index) => (
                <div key={index} className="border border-primary/20 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white/80">Amount</span>
                    <span className="font-bold text-white">{token.amount.toFixed(2)} POOKIE</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white/80">Vesting End</span>
                    <span className="text-white">{new Date(token.vestingEndDate).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/80">Status</span>
                    <span className={token.isClaimable ? "text-green-400 font-bold" : "text-yellow-400"}>
                      {token.isClaimable ? "Ready to Claim" : "Still Vesting"}
                    </span>
                  </div>
                  {token.isClaimable && (
                    <Button 
                      className="w-full mt-2 bg-primary hover:bg-primary/80 text-black font-bold"
                      onClick={() => handleClaimVestedTokens(token.id)}
                      disabled={isClaiming}
                    >
                      {isClaiming ? (
                        <span className="flex items-center">
                          <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2"></span>
                          Claiming...
                        </span>
                      ) : (
                        "Claim Tokens"
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-white/70 text-center py-6">No vested tokens found for your wallet.</p>
          )}
          
          {/* Disclaimer notice about allocations */}
          <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-600/30 rounded-md">
            <div className="flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-200">
                <span className="font-semibold">Note:</span> Token allocations shown are estimations and might not be exactly accurate on launch day.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Staking Form - only show if there's something available to stake */}
      {userContribution > stakedAmount && (
        <div className="p-6 rounded-lg bg-background/50 backdrop-blur-md border border-primary/30 w-full mb-6">
          <h3 className="text-xl font-bold text-primary mb-4">Stake Your Tokens</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Amount to stake (SOL):</span>
                <span>{stakingAmount.toFixed(2)} SOL</span>
              </div>
              <Slider
                value={[stakingAmount]}
                min={0}
                max={Math.max(0, userContribution - stakedAmount)}
                step={0.1}
                onValueChange={(value) => setStakingAmount(value[0])}
                className="my-2"
              />
              <Input
                type="number"
                value={stakingAmount}
                onChange={handleStakingAmountChange}
                min={0}
                max={userContribution - stakedAmount}
                step={0.1}
                className="h-10"
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm items-center">
                <span>Vesting period:</span>
                <span>{stakingDays} days</span>
              </div>
              <Slider
                value={[stakingDays]}
                min={1}
                max={365}
                step={1}
                onValueChange={(value) => {
                  setStakingDays(value[0])
                  setBonusPercentage(calculateBonusPercentage(value[0]))
                }}
                className="my-2"
              />
              <div className="grid grid-cols-4 gap-2">
                {[30, 90, 180, 365].map((days) => (
                  <Button
                    key={days}
                    variant="outline"
                    size="sm"
                    className={`${stakingDays === days ? 'bg-primary text-black' : 'bg-background/50'}`}
                    onClick={() => {
                      setStakingDays(days)
                      setBonusPercentage(calculateBonusPercentage(days))
                    }}
                  >
                    {days} days
                  </Button>
                ))}
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Bonus tokens:</span>
                <span className="text-green-400 font-bold">+{bonusPercentage}%</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span>Base tokens:</span>
                <span className="font-bold">{formatTokenAmount(stakingAmount * 1000)}</span>
              </div>
              
              <div className="flex justify-between text-sm">
                <span>Bonus amount:</span>
                <span className="font-bold text-green-400">{formatTokenAmount((stakingAmount * 1000) * (bonusPercentage / 100))}</span>
              </div>
              
              <div className="flex justify-between text-sm font-bold">
                <span>Total tokens:</span>
                <span className="text-primary">{formatTokenAmount((stakingAmount * 1000) * (1 + bonusPercentage / 100))}</span>
              </div>
            </div>
            
            {/* Disclaimer notice about allocations */}
            <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-600/30 rounded-md">
              <div className="flex items-start space-x-2">
                <AlertCircle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-200">
                  <span className="font-semibold">Note:</span> Token allocations shown are estimations and might not be exactly accurate on launch day.
                </p>
              </div>
            </div>
            
            <Button
              className="w-full mt-6 bg-primary hover:bg-primary/80 text-black font-bold"
              onClick={handleStakeTokens}
              disabled={isStaking || stakingAmount <= 0}
            >
              {isStaking ? (
                <span className="flex items-center">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-black mr-2"></span>
                  Staking...
                </span>
              ) : (
                "Stake Tokens"
              )}
            </Button>
            
            <div className="text-xs text-muted-foreground space-y-1">
              <p>• Staking locks your tokens for the selected period.</p>
              <p>• You will receive bonus tokens based on your vesting period.</p>
              <p>• Tokens will be airdropped to your wallet after the presale period ends.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
} 