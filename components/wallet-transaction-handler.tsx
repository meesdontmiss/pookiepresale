"use client"

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  LAMPORTS_PER_SOL 
} from '@solana/web3.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/use-toast'
import { playClickSound, playSound } from '@/hooks/use-audio'
import { motion } from "framer-motion"

// Sound paths
const CLICK_SOUND_PATH = '/sounds/click-sound.wav'
const SUCCESS_SOUND_PATH = '/sounds/success-sound.wav'

// Destination wallet for the presale
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || ""
const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

interface TransactionHandlerProps {
  maxAmount: number
  minAmount?: number
  defaultAmount?: number
  onSuccess?: (signature: string, amount: number) => void
  onError?: (error: Error) => void
  tier?: string
}

export default function WalletTransactionHandler({
  maxAmount,
  minAmount = 0.1,
  defaultAmount = 0.5,
  onSuccess,
  onError,
  tier = 'public'
}: TransactionHandlerProps) {
  const { connected, publicKey, sendTransaction } = useWallet()
  const [amount, setAmount] = useState<number>(defaultAmount)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null)
  
  // Validate amount
  const isValidAmount = amount >= minAmount && amount <= maxAmount
  
  // Verify transaction on the server
  const verifyTransaction = async (signature: string, walletAddress: string, amount: number) => {
    try {
      const response = await fetch('/api/transactions/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signature,
          walletAddress,
          amount,
          tier
        }),
      })
      
      const result = await response.json()
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Transaction verification failed')
      }
      
      return true
    } catch (error) {
      console.error('Verification error:', error)
      throw error
    }
  }
  
  // Handle sending SOL
  const handleSendSol = async () => {
    if (!connected || !publicKey) {
      toast({ 
        title: "Wallet not connected", 
        description: "Please connect your wallet to continue", 
        variant: "destructive"
      })
      if (onError) onError(new Error("Wallet not connected"))
      return
    }
    
    if (!isValidAmount) {
      toast({ 
        title: "Invalid amount", 
        description: `Amount must be between ${minAmount} and ${maxAmount} SOL`, 
        variant: "destructive"
      })
      if (onError) onError(new Error("Invalid amount"))
      return
    }
    
    try {
      setIsSubmitting(true)
      playClickSound()
      
      // Connect to the Solana network
      const connection = new Connection(SOLANA_RPC_URL, "confirmed")
      
      // Create a transaction to send SOL
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: new PublicKey(TREASURY_WALLET),
          lamports: amount * LAMPORTS_PER_SOL
        })
      )
      
      // Send the transaction
      const signature = await sendTransaction(transaction, connection)
      console.log("Transaction sent:", signature)
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, "confirmed")
      console.log("Transaction confirmed:", confirmation)
      
      // Save the transaction signature
      setTransactionSignature(signature)
      
      // Verify transaction on the server
      await verifyTransaction(signature, publicKey.toString(), amount)
      
      // Play success sound
      playSound(SUCCESS_SOUND_PATH, 0.3)
      
      // Show success message
      toast({
        title: "Contribution successful!",
        description: `Thank you for contributing ${amount} SOL. You'll receive your tokens during the airdrop.`,
      })
      
      // Call success callback
      if (onSuccess) onSuccess(signature, amount)
      
    } catch (error) {
      console.error("Transaction error:", error)
      toast({
        title: "Transaction failed",
        description: error instanceof Error ? error.message : "Please try again later",
        variant: "destructive"
      })
      if (onError) onError(error as Error)
    } finally {
      setIsSubmitting(false)
    }
  }
  
  // Format the displayed wallet address for better UX
  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };
  
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>Amount (SOL):</span>
          <span className="text-muted-foreground">{`Max: ${maxAmount} SOL`}</span>
        </div>
        
        <Input
          type="number"
          value={amount}
          onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
          min={minAmount}
          max={maxAmount}
          step={0.1}
          disabled={isSubmitting}
          className="h-10"
        />
      </div>
      
      <div className="space-y-2">
        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span>Your wallet:</span>
            <span className="font-mono text-xs truncate max-w-[180px]">
              {connected && publicKey ? formatAddress(publicKey.toString()) : 'Not connected'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Sending to:</span>
            <span className="font-mono text-xs truncate max-w-[180px]">{formatAddress(TREASURY_WALLET)}</span>
          </div>
        </div>
      </div>
      
      <Button 
        onClick={handleSendSol} 
        disabled={!connected || !isValidAmount || isSubmitting}
        className="w-full h-10"
      >
        {isSubmitting ? "Processing..." : `Contribute ${amount} SOL`}
      </Button>
      
      {transactionSignature && (
        <div className="text-xs text-muted-foreground">
          <span>Transaction ID: </span>
          <a 
            href={`https://solscan.io/tx/${transactionSignature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline truncate"
          >
            {formatAddress(transactionSignature)}
          </a>
        </div>
      )}
      
      <div className="text-xs text-muted-foreground">
        <p>
          Tokens will be airdropped to <span className="font-medium">{connected && publicKey ? formatAddress(publicKey.toString()) : 'your connected wallet'}</span> after the presale ends.
        </p>
        <p className="mt-1">
          Make sure to keep access to this wallet to receive your tokens.
        </p>
      </div>
    </div>
  )
} 