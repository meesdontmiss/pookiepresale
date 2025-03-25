"use client"

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  LAMPORTS_PER_SOL,
  Connection
} from '@solana/web3.js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/use-toast'
import { Icons } from "@/components/icons"
import { verifyTransaction } from '@/lib/transactions'

// Destination wallet for the presale
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || "4FdhCrDhcBcXyqLJGANnYbRiJyp1ApbQvXA1PYJXmdCG"

// Create a connection to the Solana API proxy to avoid 403 errors
const connection = new Connection("/api/rpc/proxy", 'confirmed');

// For Node.js environments which can't use relative URLs
if (typeof window === 'undefined') {
  // Use a fallback RPC URL for server-side operations
  const fallbackRpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  // We don't actually use this connection server-side, but define it for TypeScript
}

interface TransactionHandlerProps {
  minAmount?: number
  maxAmount?: number
  onSuccess?: (signature: string, amount: number) => void
  onError?: (error: Error) => void
  inputLabel?: string
  buttonLabel?: string
  tier?: string
}

export default function WalletTransactionHandler({
  minAmount = 0.05,
  maxAmount = 10,
  onSuccess,
  onError,
  inputLabel = "Amount (SOL)",
  buttonLabel = "Contribute",
  tier = 'public'
}: TransactionHandlerProps) {
  const wallet = useWallet()
  const { toast } = useToast()
  const [amount, setAmount] = useState<number>(minAmount)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null)
  
  // Validate amount
  const isValidAmount = amount >= minAmount && amount <= maxAmount
  
  // Handle sending SOL
  const handleSendSol = async () => {
    if (!wallet.connected || !wallet.publicKey) {
      toast({ 
        title: "Wallet not connected", 
        description: "Please connect your wallet to continue", 
        variant: "destructive"
      });
      if (onError) onError(new Error("Wallet not connected"));
      return;
    }

    if (!isValidAmount) {
      toast({ 
        title: "Invalid amount", 
        description: `Amount must be between ${minAmount} and ${maxAmount} SOL`, 
        variant: "destructive"
      });
      if (onError) onError(new Error("Invalid amount"));
      return;
    }

    setIsSubmitting(true);
    
    try {
      // Create a transaction
      const transaction = new Transaction();
      
      // Add instructions to send SOL
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: new PublicKey(TREASURY_WALLET),
          lamports: Math.floor(amount * LAMPORTS_PER_SOL)
        })
      );
      
      // Get the latest blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;
      
      // Sign and send the transaction
      const signature = await wallet.sendTransaction(transaction, connection);
      console.log('Transaction sent:', signature);
      
      // Set the transaction signature
      setTransactionSignature(signature);
      
      // Verify the transaction
      try {
        await verifyTransaction(signature, wallet.publicKey.toString(), amount);
      } catch (err) {
        console.warn('Verification warning:', err);
        // Continue even if verification has issues
      }
      
      // Show success message
      toast({
        title: "Contribution successful!",
        description: `Thank you for contributing ${amount} SOL. You'll receive your tokens during the airdrop.`,
      });
      
      if (onSuccess) onSuccess(signature, amount);
    } catch (error) {
      console.error('Transaction error:', error);
      toast({
        title: "Transaction failed",
        description: error instanceof Error ? error.message : "Please try again later",
        variant: "destructive"
      });
      if (onError) onError(error instanceof Error ? error : new Error("Failed to send transaction"));
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (isValidAmount && !isSubmitting) handleSendSol(); }}>
      <div className="space-y-4">
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-foreground mb-1">
            {inputLabel}
          </label>
          <div className="relative">
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => {
                const value = parseFloat(e.target.value);
                setAmount(isNaN(value) ? 0 : value);
              }}
              min={minAmount}
              max={maxAmount}
              step={0.01}
              required
              className="border-input bg-background"
              disabled={isSubmitting}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-muted-foreground">
              SOL
            </div>
          </div>
          {!isValidAmount && (
            <p className="text-xs text-red-500 mt-1">
              Amount must be between {minAmount} and {maxAmount} SOL
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            Min: {minAmount} SOL, Max: {maxAmount} SOL
          </p>
        </div>

        <Button
          type="submit"
          disabled={!wallet.connected || !isValidAmount || isSubmitting}
          className="w-full bg-primary hover:bg-primary/90 text-white"
        >
          {isSubmitting ? (
            <>
              <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            buttonLabel
          )}
        </Button>

        {transactionSignature && (
          <div className="mt-4 p-3 bg-background border border-accent rounded-md">
            <p className="text-sm font-medium mb-1">Transaction Successful!</p>
            <a
              href={`https://solscan.io/tx/${transactionSignature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline break-all"
            >
              View transaction: {transactionSignature}
            </a>
          </div>
        )}
      </div>
    </form>
  )
} 