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
// Use multiple fallback RPC endpoints to avoid 403 errors
const SOLANA_RPC_ENDPOINTS = [
  "https://rpc.helius.xyz/?api-key=28cda6d9-5527-4c12-a0b3-cf2c6e54c1a4", // Helius RPC (more reliable)
  "https://solana-mainnet.phantom.app/YBPpkkN4g91xDiAnTE9r0RcMkjg0sKUIWvAfoFVJ",
  "https://api.mainnet-beta.solana.com"
];

// Log environment variables at runtime
console.log("Environment variables loaded:");
console.log("- TREASURY_WALLET:", TREASURY_WALLET);
console.log("- SOLANA_RPC_ENDPOINTS:", SOLANA_RPC_ENDPOINTS);

interface TransactionHandlerProps {
  maxAmount: number
  minAmount?: number
  defaultAmount?: number
  onSuccess?: (signature: string, amount: number) => void
  onError?: (error: Error) => void
  tier?: string
}

// Create a function to get a working RPC connection
async function getWorkingConnection(): Promise<Connection> {
  for (const endpoint of SOLANA_RPC_ENDPOINTS) {
    try {
      const connection = new Connection(endpoint, {
        commitment: "confirmed",
        confirmTransactionInitialTimeout: 60000
      });
      
      // Test the connection
      await connection.getLatestBlockhash();
      console.log(`Successfully connected to RPC endpoint: ${endpoint}`);
      return connection;
    } catch (err) {
      console.warn(`Failed to connect to ${endpoint}:`, err);
      continue;
    }
  }
  throw new Error("Unable to establish connection to any Solana RPC endpoint");
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
    if (!connected || !publicKey) {
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

    if (!TREASURY_WALLET) {
      toast({ 
        title: "Configuration error", 
        description: "Treasury wallet not configured correctly", 
        variant: "destructive"
      });
      if (onError) onError(new Error("Treasury wallet not configured"));
      return;
    }

    try {
      setIsSubmitting(true);
      playClickSound();

      // Get a working RPC connection
      const connection = await getWorkingConnection();

      // Get latest blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
      console.log("Got latest blockhash:", blockhash);

      // Create transaction
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
      const treasuryPubkey = new PublicKey(TREASURY_WALLET);
      
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: treasuryPubkey,
          lamports
        })
      );

      // Set transaction parameters
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      let signature: string | undefined;

      // First try using Phantom's native method
      if (typeof window !== 'undefined' && 'solana' in window) {
        const phantomWallet = window.solana as PhantomWallet;
        if (phantomWallet?.isPhantom) {
          try {
            console.log("Using Phantom's native transaction method...");
            signature = await phantomWallet.signAndSendTransaction(transaction);
            console.log("Phantom transaction sent:", signature);
          } catch (phantomError) {
            console.warn("Phantom native method failed:", phantomError);
            // Don't throw, let it fall through to adapter method
          }
        }
      }

      // If Phantom method wasn't available or failed, try wallet adapter
      if (!signature && wallet?.adapter) {
        try {
          console.log("Using wallet adapter...");
          signature = await wallet.adapter.sendTransaction(transaction, connection);
          console.log("Wallet adapter transaction sent:", signature);
        } catch (adapterError) {
          console.error("Wallet adapter send failed:", adapterError);
          throw adapterError;
        }
      }

      if (!signature) {
        throw new Error("No wallet method available to send transaction");
      }

      // Wait for confirmation
      console.log("Waiting for confirmation...");
      const confirmationResponse = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, "confirmed");

      if (confirmationResponse.value.err) {
        throw new Error(`Transaction failed: ${confirmationResponse.value.err.toString()}`);
      }

      console.log("Transaction confirmed:", confirmationResponse);

      // Transaction successful
      setTransactionSignature(signature);
      await verifyTransaction(signature, publicKey.toString(), amount);
      playSound(SUCCESS_SOUND_PATH, 0.3);
      
      toast({
        title: "Contribution successful!",
        description: `Thank you for contributing ${amount} SOL. You'll receive your tokens during the airdrop.`,
      });

      if (onSuccess) onSuccess(signature, amount);

    } catch (error: unknown) {
      console.error("Transaction error:", error);
      toast({
        title: "Transaction failed",
        description: error instanceof Error ? error.message : "Please try again later",
        variant: "destructive"
      });
      if (onError) onError(error instanceof Error ? error : new Error("Transaction failed"));
    } finally {
      setIsSubmitting(false);
    }
  };
  
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