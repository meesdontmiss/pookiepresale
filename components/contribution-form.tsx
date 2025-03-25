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
import { X, Info, Check, ExternalLink } from "lucide-react"
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

// Custom event to trigger progress bar update across components
const PROGRESS_UPDATE_EVENT = 'pookie-progress-update';

// Treasury wallet to monitor
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || "4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh";

interface ContributionFormProps {
  maxContribution: number
  tier: "core" | "public"
  onClose: () => void
}

export default function ContributionForm({ maxContribution, tier, onClose }: ContributionFormProps) {
  const { publicKey, signTransaction, connected } = useWallet()
  const [amount, setAmount] = useState<string>(tier === "public" ? "0.25" : "0.5")
  const [isContributing, setIsContributing] = useState(false)
  const [selectedOption, setSelectedOption] = useState<number>(tier === "public" ? 0.25 : 0.5)
  const [showCelebration, setShowCelebration] = useState(false)
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null)
  const { toast: useToastToast } = useToast()

  // Function to monitor treasury wallet balance
  const monitorTreasuryBalance = async () => {
    try {
      if (typeof window === 'undefined') return;
      
      const { Connection, PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
      const baseUrl = window.location.origin;
      const connection = new Connection(`${baseUrl}/api/rpc/proxy`, 'confirmed');
      
      // Get treasury balance
      const treasuryBalance = await connection.getBalance(new PublicKey(TREASURY_WALLET));
      const solBalance = treasuryBalance / LAMPORTS_PER_SOL;
      
      console.log(`Treasury wallet balance: ${solBalance.toFixed(4)} SOL`);
      
      // Update the progress bar based on the actual wallet balance
      const event = new CustomEvent(PROGRESS_UPDATE_EVENT, { 
        detail: {
          raised: solBalance,
          cap: 75, // Keep the cap at 75 SOL
          contributors: null // We don't know the exact contributor count from the wallet balance
        }
      });
      window.dispatchEvent(event);
      
      return solBalance;
    } catch (error) {
      console.error('Error monitoring treasury balance:', error);
      return null;
    }
  };

  // Function to immediately refresh presale stats after a successful contribution
  const refreshPresaleStats = async () => {
    try {
      // First, check the treasury wallet balance directly
      const treasuryBalance = await monitorTreasuryBalance();
      
      // Then fetch stats from the API to update contributor count
      const response = await fetch('/api/presale/stats');
      if (!response.ok) throw new Error('Failed to fetch presale stats');
      
      const data = await response.json();
      if (data.success) {
        // Dispatch a custom event with the latest stats to update progress bar
        const event = new CustomEvent(PROGRESS_UPDATE_EVENT, { 
          detail: {
            // Use treasury balance if available, otherwise use API data
            raised: treasuryBalance || Number(data.stats.total_raised || 0),
            cap: Number(data.stats.cap || 75),
            contributors: Number(data.stats.contributors || 0)
          }
        });
        window.dispatchEvent(event);
        
        console.log('Stats refreshed after contribution:', 
          treasuryBalance ? `Treasury balance: ${treasuryBalance.toFixed(4)} SOL` : data.stats);
      }
    } catch (error) {
      console.error('Error refreshing presale stats:', error);
    }
  };

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
      const { Connection, SystemProgram, Transaction, PublicKey, sendAndConfirmTransaction, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
      
      // Create connection to Solana using our API proxy to avoid 403 errors
      let connection;
      
      // Use our proxy URL in the browser, but fall back to the env var for server-side
      if (typeof window !== 'undefined') {
        const baseUrl = window.location.origin;
        connection = new Connection(`${baseUrl}/api/rpc/proxy`, 'confirmed');
      } else {
        // Server-side connection (should not be used from client components, but adding for completeness)
        connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com', 'confirmed');
      }
      
      // Create a transaction to send SOL to treasury
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(treasuryWallet),
          lamports: numericAmount * LAMPORTS_PER_SOL, // Convert SOL to lamports
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
        
        // Set the transaction signature for viewing later
        setTransactionSignature(signature);
        
        // Wait for confirmation
        await connection.confirmTransaction(signature, 'confirmed');
        
        // Play success sound
        playSound('/sounds/notification.wav');
        
        useToastToast({
          title: "Transaction sent!",
          description: "Verifying your contribution...",
        });
        
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
        
        // Calculate token amounts
        const { baseTokens, totalTokens } = calculateTokens(numericAmount, 0);
        
        useToastToast({
          title: "Contribution successful!",
          description: (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1 text-green-500">
                <Check size={16} className="flex-shrink-0" />
                <span>Transaction confirmed on Solana blockchain</span>
              </div>
              <p>You contributed {numericAmount} SOL and will receive {formatTokenAmount(totalTokens)} POOKIE tokens.</p>
              <a 
                href={`https://solscan.io/tx/${signature}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-1"
              >
                <ExternalLink size={12} />
                <span>View transaction on Solscan</span>
              </a>
            </div>
          ),
        });
        
        // Immediately refresh the presale stats to update the progress bar
        refreshPresaleStats();
        
        // Check if the user hit the celebration milestone
        if (numericAmount === CELEBRATION_MILESTONE) {
          // Show special celebration for the milestone contribution!
          setShowCelebration(true);
        }
        
        // Close the form after success
        setTimeout(() => {
          onClose();
        }, 5000);
        
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
                You've contributed 2 SOL to the Pookie presale!
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
          
          <div className="flex items-start gap-2 rounded-md bg-muted p-2 text-xs">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Token Information</p>
              <p className="mt-1 text-muted-foreground">
                Your POOKIE tokens will be available at token launch. Tokens will be distributed based on your contribution amount.
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-2 rounded-md bg-blue-900/20 p-2 text-xs">
            <Info className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-400" />
            <div>
              <p className="font-medium text-blue-400">Wallet Connected</p>
              <p className="mt-1 text-blue-300">
                Using wallet: {publicKey ? `${publicKey.toString().substring(0, 4)}...${publicKey.toString().substring(publicKey.toString().length - 4)}` : 'Not connected'}
              </p>
            </div>
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
              disabled={isContributing || !publicKey}
            >
              {isContributing ? "Processing..." : `Contribute ${selectedOption} SOL`}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}

