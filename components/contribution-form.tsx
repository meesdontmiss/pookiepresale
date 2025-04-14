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

// Format wallet address for display
const formatWalletAddress = (address: string): string => {
  if (!address) return '';
  return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
};

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
  
  // Add state to track if presale is concluded - always true now
  const [presaleConcluded] = useState(true)

  // Function to monitor treasury wallet balance
  const monitorTreasuryBalance = async () => {
    try {
      if (typeof window === 'undefined') return;
      
      const { Connection, PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
      const baseUrl = window.location.origin;
      const connection = new Connection(`${baseUrl}/api/rpc/proxy`, 'confirmed');
      
      // Get treasury balance - try multiple times if we get zero
      let retryCount = 0;
      let solBalance = 0;
      
      while (solBalance <= 0 && retryCount < 3) {
        const treasuryBalance = await connection.getBalance(new PublicKey(TREASURY_WALLET));
        solBalance = treasuryBalance / LAMPORTS_PER_SOL;
        
        if (solBalance <= 0) {
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
          retryCount++;
        }
      }
      
      console.log(`Treasury wallet balance: ${solBalance.toFixed(4)} SOL`);
      
      // Only dispatch event if we got a valid balance
      if (solBalance > 0) {
        // Update the progress bar based on the actual wallet balance
        const event = new CustomEvent(PROGRESS_UPDATE_EVENT, { 
          detail: {
            raised: solBalance,
            cap: 75, // Keep the cap at 75 SOL
            contributors: null // We don't know the exact contributor count from the wallet balance
          }
        });
        window.dispatchEvent(event);
      }
      
      return solBalance > 0 ? solBalance : null;
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
        // Only dispatch if we have valid data
        const apiRaisedAmount = Number(data.stats.total_raised || 0);
        const validRaisedAmount = treasuryBalance !== null ? treasuryBalance : apiRaisedAmount;
        
        if (validRaisedAmount > 0) {
          // Dispatch a custom event with the latest stats to update progress bar
          const event = new CustomEvent(PROGRESS_UPDATE_EVENT, { 
            detail: {
              // Use treasury balance if available, otherwise use API data
              raised: validRaisedAmount,
              cap: Number(data.stats.cap || 75),
              contributors: Number(data.stats.contributors || 0)
            }
          });
          window.dispatchEvent(event);
          
          console.log('Stats refreshed after contribution:', 
            treasuryBalance !== null ? `Treasury balance: ${treasuryBalance.toFixed(4)} SOL` : `API data: ${apiRaisedAmount} SOL`);
        }
      }
      
      // Set up a follow-up check after a short delay to ensure the stats are updated
      setTimeout(async () => {
        await monitorTreasuryBalance();
      }, 5000);
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
    
    // Show presale concluded message instead of proceeding
    useToastToast({
      title: "Presale Concluded",
      description: "The $POOKIE presale has concluded. Thank you for your support!",
      variant: "default",
    });
    return;
    
    // The rest of the function will never execute
    // ... existing submission code ...
  }

  // Render a different UI for concluded presale
  if (presaleConcluded) {
    return (
      <div className="bg-background/30 p-4 rounded-lg backdrop-blur-sm border border-primary/20">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-primary">Presale Concluded</h3>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-800/50 p-3">
            <p className="text-sm text-center">
              The $POOKIE presale has concluded. Thank you for your support!
            </p>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center p-2 bg-gray-800/30 rounded-md">
              <p className="text-xs text-gray-400">Total Raised</p>
              <p className="font-bold">{/* Let the event system handle this display */}</p>
            </div>
            <div className="text-center p-2 bg-gray-800/30 rounded-md">
              <p className="text-xs text-gray-400">Status</p>
              <p className="font-bold text-red-500">CONCLUDED</p>
            </div>
          </div>
          
          <Button 
            className="w-full bg-gray-700 hover:bg-gray-600 cursor-not-allowed"
            disabled={true}
          >
            Presale Concluded
          </Button>
        </div>
      </div>
    )
  }

  // Original render for active presale
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
                onClick={() => setShowCelebration(false)}
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
                <Button onClick={() => setShowCelebration(false)}>
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

