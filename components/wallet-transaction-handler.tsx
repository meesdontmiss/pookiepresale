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

// Define the Phantom wallet interface for window.solana
// Only declare in module scope (not global) to avoid conflicts with other definitions
type PhantomWallet = {
  connect: () => Promise<void>;
  signAndSendTransaction: (transaction: Transaction) => Promise<string>;
  isPhantom?: boolean;
  publicKey?: PublicKey;
}

// Sound paths
const CLICK_SOUND_PATH = '/sounds/click-sound.wav'
const SUCCESS_SOUND_PATH = '/sounds/success-sound.wav'

// Destination wallet for the presale
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || ""
// Use a public RPC endpoint that doesn't require authentication
const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com" // Fallback to public RPC

// Log environment variables at runtime
console.log("Environment variables loaded:");
console.log("- TREASURY_WALLET:", TREASURY_WALLET);
console.log("- SOLANA_RPC_URL:", SOLANA_RPC_URL);

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
  const { connected, publicKey, sendTransaction, wallet, connecting, disconnect } = useWallet()
  const [amount, setAmount] = useState<number>(defaultAmount)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null)
  
  // Log wallet state on mount and changes
  useEffect(() => {
    console.log("Wallet state changed:");
    console.log("- Connected:", connected);
    console.log("- Connecting:", connecting);
    console.log("- Wallet:", wallet?.adapter.name);
    console.log("- PublicKey:", publicKey?.toString());
  }, [connected, connecting, wallet, publicKey]);
  
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
    console.log("handleSendSol called, wallet connected:", connected);
    console.log("Public key:", publicKey?.toString());
    console.log("Treasury wallet:", TREASURY_WALLET);
    
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
    
    // Verify treasury wallet
    if (!TREASURY_WALLET) {
      toast({ 
        title: "Configuration error", 
        description: "Treasury wallet not configured correctly. Please contact support.", 
        variant: "destructive"
      })
      if (onError) onError(new Error("Treasury wallet not configured"))
      return
    }

    try {
      // Validate treasury wallet is a valid Solana address
      try {
        new PublicKey(TREASURY_WALLET);
      } catch (error) {
        toast({ 
          title: "Configuration error", 
          description: "Invalid treasury wallet address. Please contact support.", 
          variant: "destructive"
        })
        if (onError) onError(new Error("Invalid treasury wallet address"))
        return
      }
      
      setIsSubmitting(true)
      playClickSound()
      
      console.log("Creating Solana connection with URL:", SOLANA_RPC_URL);
      
      // Connect to the Solana network
      const connection = new Connection(SOLANA_RPC_URL, {
        commitment: "confirmed",
        confirmTransactionInitialTimeout: 60000 // 60 seconds timeout
      })
      
      console.log("Getting latest blockhash...");
      
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized")
      console.log("Blockhash received:", blockhash);
      
      // Create a transaction to send SOL
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      console.log("Creating transaction to send", lamports, "lamports (", amount, "SOL)");
      
      // Create instruction
      const instruction = SystemProgram.transfer({
        fromPubkey: publicKey,
        toPubkey: new PublicKey(TREASURY_WALLET),
        lamports: lamports
      });
      
      // Create transaction with instruction
      const transaction = new Transaction();
      transaction.add(instruction);
      
      // Set transaction parameters
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      console.log("Transaction created with instruction:", instruction);
      console.log("Transaction created, sending to wallet for signing...");
      
      // Send the transaction with explicit options to trigger wallet popup
      try {
        if (!wallet || !wallet.adapter) {
          console.error("No wallet adapter available");
          throw new Error("Your wallet isn't properly connected. Please reconnect your wallet.");
        }
        
        let signature;
        
        // Try primary send method
        try {
          // Use standard sendTransaction from useWallet directly - simplest method
          console.log("Using standard sendTransaction hook...");
          signature = await sendTransaction(transaction, connection);
        } catch (sendError) {
          console.error("Error with sendTransaction hook, trying wallet adapter directly:", sendError);
          
          // Try wallet adapter's sendTransaction method
          if (wallet?.adapter?.sendTransaction) {
            console.log("Using wallet.adapter.sendTransaction directly...");
            signature = await wallet.adapter.sendTransaction(transaction, connection);
          } else {
            console.error("Wallet adapter doesn't support sendTransaction");
            
            // Last resort: For Phantom wallet, try using window.solana if available
            if (typeof window !== 'undefined' && 'solana' in window) {
              try {
                console.log("Attempting to use window.solana (Phantom wallet)...");
                const phantomWallet = window.solana as PhantomWallet;
                await phantomWallet.connect();
                signature = await phantomWallet.signAndSendTransaction(transaction);
              } catch (phantomError) {
                console.error("Error with Phantom direct method:", phantomError);
                throw new Error("Failed to send transaction through your wallet. Please try refreshing the page or using a different wallet.");
              }
            } else {
              throw new Error("Your wallet doesn't support the required transaction methods");
            }
          }
        }
        
        console.log("Transaction signed and sent:", signature);
        
        // Wait for confirmation with increased timeout
        console.log("Waiting for confirmation...");
        
        // Wait for confirmation with increased timeout
        const confirmation = await connection.confirmTransaction({
          blockhash, 
          lastValidBlockHeight,
          signature
        }, "confirmed");
        console.log("Transaction confirmed:", confirmation);
        
        // Save the transaction signature
        setTransactionSignature(signature);
        
        // Verify transaction on the server
        await verifyTransaction(signature, publicKey.toString(), amount);
        
        // Play success sound
        playSound(SUCCESS_SOUND_PATH, 0.3);
        
        // Show success message
        toast({
          title: "Contribution successful!",
          description: `Thank you for contributing ${amount} SOL. You'll receive your tokens during the airdrop.`,
        });
        
        // Call success callback
        if (onSuccess) onSuccess(signature, amount);
      } catch (error) {
        console.error("Transaction error in wallet send:", error);
        throw error;
      }
      
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
      
      {/* Debug button - only for testing wallet connection */}
      <Button 
        onClick={() => {
          console.log("Debug wallet state:", {
            connected,
            connecting,
            wallet: wallet?.adapter.name,
            publicKey: publicKey?.toString()
          });
          
          if (wallet?.adapter && typeof wallet.adapter.connect === 'function') {
            console.log("Attempting debug wallet reconnect...");
            wallet.adapter.connect()
              .then(() => console.log("Debug wallet connect successful"))
              .catch(err => console.error("Debug wallet connect failed:", err));
          }
        }} 
        className="w-full h-8 mt-2 text-xs bg-gray-700"
        type="button"
      >
        Debug Wallet
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