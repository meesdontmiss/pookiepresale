"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import type { PublicKey } from "@solana/web3.js"
import { Button } from "@/components/ui/button"
import type { ButtonProps } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"
import { playClickSound, playSound } from "@/hooks/use-audio"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import Image from "next/image"
import { X, Info } from "lucide-react"
import dynamic from "next/dynamic"
import { calculateTokens, formatTokenAmount } from '@/utils/token-supply'
import { motion } from 'framer-motion'

// Dynamically import the fireworks component 
const FireworksEffect = dynamic(() => import('@/components/fireworks-effect'), { 
  ssr: false,
  loading: () => null
})

// Click sound path
const CLICK_SOUND_PATH = '/sounds/click-sound.wav'

// Predefined SOL contribution amounts
const PRIVATE_CONTRIBUTION_OPTIONS = [0.5, 1.0, 1.5, 2.0];
const PUBLIC_CONTRIBUTION_AMOUNT = 0.25;

// Special milestone for celebration
const CELEBRATION_MILESTONE = 2.0;

// Vesting options based on lock-up period
const VESTING_OPTIONS = [
  { days: 0, bonus: 0 },    // 0% bonus for no lock-up
  { days: 1, bonus: 10 },   // 10% bonus for 1-day lock-up
  { days: 3, bonus: 20 },   // 20% bonus for 3-day lock-up 
  { days: 5, bonus: 30 },   // 30% bonus for 5-day lock-up
  { days: 7, bonus: 40 },   // 40% bonus for 7-day lock-up
];

interface ContributionFormProps {
  maxContribution: number
  tier: "core" | "public"
  onClose: () => void
}

export default function ContributionForm({ maxContribution, tier, onClose }: ContributionFormProps) {
  const { publicKey, signTransaction, connected } = useWallet()
  const [amount, setAmount] = useState<string>(tier === "public" ? "0.25" : "0.5")
  const [address, setAddress] = useState<string>("")
  const [isContributing, setIsContributing] = useState(false)
  const [selectedOption, setSelectedOption] = useState<number>(tier === "public" ? 0.25 : 0.5)
  const [selectedVesting, setSelectedVesting] = useState<number>(0) // Index of selected vesting option
  const [showCelebration, setShowCelebration] = useState(false)
  const { toast: useToastToast } = useToast()

  // Fetch vesting options from the API
  const [apiVestingOptions, setApiVestingOptions] = useState<typeof VESTING_OPTIONS>([]);
  
  useEffect(() => {
    const fetchVestingOptions = async () => {
      try {
        const response = await fetch('/api/vesting/options');
        
        if (!response.ok) {
          throw new Error('Failed to fetch vesting options');
        }
        
        const result = await response.json();
        
        if (result.success && result.data && Array.isArray(result.data)) {
          // Map API response to the format expected by the component
          const formattedOptions = result.data.map((option: any) => ({
            days: option.days,
            bonus: option.bonus_percentage
          }));
          
          // Only update if we got valid data
          if (formattedOptions.length > 0) {
            setApiVestingOptions(formattedOptions);
          }
        }
      } catch (error) {
        console.error('Error fetching vesting options:', error);
        // Fall back to hardcoded options if API fails
      }
    };
    
    fetchVestingOptions();
  }, []);
  
  // Use API options if available, otherwise fall back to hardcoded options
  const activeVestingOptions = apiVestingOptions.length > 0 ? apiVestingOptions : VESTING_OPTIONS;

  // Get available options based on tier
  const availableOptions = tier === "public" 
    ? [PUBLIC_CONTRIBUTION_AMOUNT]
    : PRIVATE_CONTRIBUTION_OPTIONS;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    // Don't allow manual input, only preset options
    // This ensures contributions are always in 0.5 SOL increments
  }

  const setPresetAmount = (value: number) => {
    setAmount(value.toString())
    setSelectedOption(value)
    // Global handler will play click sound
  }

  const setVestingOption = (index: number) => {
    setSelectedVesting(index)
    // Global handler will play click sound
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Get the numeric amount based on selected option
    const numericAmount = selectedOption;
    
    // Check if a valid amount is selected
    if (!numericAmount) {
      useToastToast({
        title: "Invalid amount",
        description: "Please select one of the available contribution amounts",
        variant: "destructive",
      });
      return;
    }
    
    // Check if wallet is connected
    if (!publicKey) {
      useToastToast({
        title: "Wallet not connected",
        description: "Please connect your Solana wallet before contributing",
        variant: "destructive",
      });
      return;
    }
    
    // Use the wallet's public key instead of manually entered address
    const walletAddress = publicKey.toString();
    
    setIsContributing(true);
    
    try {
      // Get treasury wallet address from environment variables
      const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET;
      
      if (!treasuryWallet) {
        throw new Error('Treasury wallet not configured');
      }
      
      // Display confirmation message
      useToastToast({
        title: "Preparing transaction",
        description: `Please approve the transaction for ${numericAmount} SOL in your wallet`,
      });
      
      // We need to send SOL to treasury wallet in a proper transaction
      // Use @solana/web3.js to create and send the transaction
      const { Connection, SystemProgram, Transaction, PublicKey, sendAndConfirmTransaction } = await import('@solana/web3.js');
      
      // Create connection to Solana using our API proxy to avoid 403 errors
      let connection;
      
      // Use our proxy URL in the browser, but fall back to the env var for server-side
      if (typeof window !== 'undefined') {
        connection = new Connection('/api/rpc/proxy', 'confirmed');
      } else {
        // Server-side connection (should not be used from client components, but adding for completeness)
        connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
      }
      
      // Create a transaction to send SOL to treasury
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(treasuryWallet),
          lamports: numericAmount * 1000000000, // Convert SOL to lamports
        })
      );
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      try {
        // Send transaction
        if (!signTransaction) {
          throw new Error('Wallet does not support signTransaction');
        }
        
        const signedTransaction = await signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signedTransaction.serialize());
        
        // Wait for confirmation
        await connection.confirmTransaction(signature, 'confirmed');
        
        useToastToast({
          title: "Transaction sent!",
          description: "Verifying your contribution...",
        });
        
        // Get the selected vesting option
        const vestingOption = activeVestingOptions[selectedVesting];
        
        // Verify the transaction with our API
        const verifyResponse = await fetch('/api/transactions/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            signature,
            walletAddress,
            amount: numericAmount,
            tier,
          }),
        });
        
        const verifyResult = await verifyResponse.json();
        
        if (!verifyResponse.ok) {
          throw new Error(verifyResult.error || 'Failed to verify transaction');
        }
        
        // Success! Transaction verified
        const lockupPeriod = vestingOption.days === 0 ? "no lock-up" : `${vestingOption.days}-day lock-up`;
        
        // Call the vesting API to set up vesting schedule if needed
        if (vestingOption.days > 0) {
          const vestingResponse = await fetch('/api/vesting/setup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              walletAddress,
              days: vestingOption.days,
              contributionId: verifyResult.transaction?.id,
              bonusPercentage: vestingOption.bonus
            }),
          });
          
          if (!vestingResponse.ok) {
            console.warn('Vesting setup warning:', await vestingResponse.json());
            // Continue even if vesting setup had issues, we'll fix it later
          }
        }
        
        // Calculate token amounts
        const { baseTokens, bonusTokens, totalTokens } = calculateContributionTokens(numericAmount, vestingOption.bonus);
        
        useToastToast({
          title: "Contribution successful!",
          description: `You contributed ${numericAmount} SOL and will receive ${formatTokenAmount(totalTokens)} POOKIE tokens with a ${vestingOption.bonus}% bonus (${lockupPeriod}).`,
        });
        
        // Check if the user hit the celebration milestone
        if (numericAmount === CELEBRATION_MILESTONE) {
          // Show special celebration for the milestone contribution!
          setShowCelebration(true);
        }
        
        // Close the form after success
        setTimeout(() => {
          onClose();
        }, 2000);
        
      } catch (error) {
        console.error('Transaction error:', error);
        useToastToast({
          title: "Transaction failed",
          description: error instanceof Error ? error.message : "Failed to complete transaction",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Contribution error:', error);
      useToastToast({
        title: "Contribution failed",
        description: error instanceof Error ? error.message : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsContributing(false);
    }
  };

  const closeCelebration = () => {
    setShowCelebration(false);
  };

  // Get the current vesting option
  const currentVestingOption = activeVestingOptions[selectedVesting] || VESTING_OPTIONS[selectedVesting];

  // Calculate the token amount based on contribution
  const calculateContributionTokens = (contributionAmount: number, bonusPercentage: number) => {
    const { baseTokens, bonusTokens, totalTokens } = calculateTokens(contributionAmount, bonusPercentage)
    return {
      baseTokens,
      bonusTokens,
      totalTokens
    }
  }

  return (
    <>
      {showCelebration && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          {/* Large Fireworks effect with more particles */}
          <FireworksEffect 
            duration={8000} 
            particleCount={60} 
            burstCount={15} 
            imagePath="/images/pookie-flag.png"
          />
          
          {/* Modal with celebration image */}
          <div className="relative bg-background rounded-lg shadow-xl max-w-xl w-full mx-4 overflow-hidden z-[101]">
            <div className="absolute top-3 right-3 z-10">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 rounded-full bg-black/20 hover:bg-black/40"
                onClick={closeCelebration}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>
            
            <div className="p-4">
              <h2 className="text-7xl font-bold text-center mb-4">🅿️</h2>
              <p className="text-center text-sm text-muted-foreground mb-4">
                You've contributed 2 SOL to the Pookie presale with a {currentVestingOption.bonus}% vesting bonus!
              </p>
              
              <div className="relative w-full aspect-video">
                <Image 
                  src="/images/POOKIE-VS-THE-WORLD.png" 
                  alt="POOKIE VS THE WORLD" 
                  fill
                  className="object-contain"
                />
              </div>
              
              <div className="mt-4 text-center">
                <Button onClick={closeCelebration}>
                  Continue
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="p-3">
        <h3 className="text-sm font-bold mb-2">
          {tier === "public" 
            ? "Public Sale Contribution (0.25 SOL)"
            : "Private Sale Contribution Amount (SOL)"
          }
        </h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Preset amount buttons */}
          <div className={`grid ${tier === "public" ? "grid-cols-1" : "grid-cols-4"} gap-1`}>
            {availableOptions.map((presetAmount) => {
              const isSelected = selectedOption === presetAmount;
              const isMilestone = presetAmount === CELEBRATION_MILESTONE;
              
              return (
                <Button
                  key={presetAmount}
                  type="button"
                  className={`relative h-9 text-xs py-0 ${
                    isSelected ? 'bg-primary text-primary-foreground' : 'border border-input bg-background'
                  } ${isMilestone ? 'glow-effect' : ''}`}
                  onClick={() => setPresetAmount(presetAmount)}
                >
                  <div>
                    <div>{presetAmount} SOL</div>
                  </div>
                  {isMilestone && <span className="absolute top-1 right-1">🔥</span>}
                </Button>
              );
            })}
          </div>
          
          <div className="border rounded-md p-2 space-y-2">
            <h4 className="text-xs font-medium">Vesting Period (Optional)</h4>
            <p className="text-xs text-muted-foreground">Lock up your tokens for bonus rewards</p>
            
            <div className="grid grid-cols-5 gap-1 mt-1">
              {activeVestingOptions.map((option, index) => {
                const isSelected = selectedVesting === index;
                return (
                  <Button
                    key={index}
                    type="button"
                    variant="outline"
                    className={`h-auto py-2 px-1 text-xs ${isSelected ? 'bg-primary text-primary-foreground' : ''}`}
                    onClick={() => setVestingOption(index)}
                  >
                    <div className="flex flex-col">
                      {option.days === 0 ? (
                        <span>No Lock</span>
                      ) : (
                        <>
                          <span>{option.days}d</span>
                          <span className="text-[10px]">+{option.bonus}%</span>
                        </>
                      )}
                    </div>
                  </Button>
                );
              })}
            </div>
          </div>
          
          <div className="flex items-start gap-2 rounded-md bg-muted p-2 text-xs">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Vesting Information</p>
              <p className="mt-1 text-muted-foreground">
                {currentVestingOption.days === 0 ? (
                  "You've selected no lock-up period. Your tokens will be fully available at launch."
                ) : (
                  <>You've selected a {currentVestingOption.days}-day lock-up period for a {currentVestingOption.bonus}% bonus on your token allocation.</>
                )}
              </p>
            </div>
          </div>
          
          {/* Wallet address */}
          <div>
            <Label htmlFor="wallet" className="text-xs">Solana Wallet Address</Label>
            <Input
              id="wallet"
              type="text"
              placeholder="Enter your Solana wallet address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="h-8 text-sm mt-1"
              required
            />
          </div>
        
          {/* Action buttons */}
          <div className="flex gap-2 mt-3">
            <Button
              type="button"
              className="flex-1 h-8 text-xs border border-input bg-background hover:bg-accent hover:text-accent-foreground"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="flex-1 h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isContributing}
            >
              {isContributing ? "Processing..." : `Contribute ${selectedOption} SOL`}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}

