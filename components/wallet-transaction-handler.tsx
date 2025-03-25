"use client"

import { useState, useEffect } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
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
import { Icons } from "@/components/icons"
import { useToast } from '@/components/ui/use-toast'
import { useSound } from '@/hooks/use-sound'
import { verifyTransaction } from '@/lib/transactions'

// Define the Phantom wallet interface for window.solana
// Only declare in module scope (not global) to avoid conflicts with other definitions
type PhantomWallet = {
  connect: () => Promise<void>;
  signAndSendTransaction: (transaction: Transaction) => Promise<string>;
  isPhantom?: boolean;
  publicKey?: PublicKey;
}

// Sound paths
const CLICK_SOUND_PATH = '/sounds/click.mp3'
const SUCCESS_SOUND_PATH = '/sounds/success.mp3'

// Destination wallet for the presale
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || "4FdhCrDhcBcXyqLJGANnYbRiJyp1ApbQvXA1PYJXmdCG"
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
  minAmount?: number
  maxAmount?: number
  onSuccess?: (signature: string, amount: number) => void
  onError?: (error: Error) => void
  inputLabel?: string
  buttonLabel?: string
  tier?: string
}

// Utility function to get the best RPC connection
const getBestConnection = async (connection: Connection, fallbackUrls: string[]): Promise<Connection> => {
  // Try using the provided connection first
  try {
    // Test the current connection
    console.log("Testing existing connection...");
    await connection.getLatestBlockhash();
    console.log("Using existing connection successfully");
    return connection;
  } catch (err) {
    console.warn("Existing connection failed:", err);
    
    // Fall back to trying each URL in the fallback list
    for (const endpoint of fallbackUrls) {
      try {
        console.log(`Trying fallback RPC endpoint: ${endpoint}`);
        const fallbackConnection = new Connection(endpoint, {
          commitment: "confirmed",
          confirmTransactionInitialTimeout: 60000
        });
        
        // Test the connection
        await fallbackConnection.getLatestBlockhash();
        console.log(`Successfully connected to RPC endpoint: ${endpoint}`);
        return fallbackConnection;
      } catch (err) {
        console.warn(`Failed to connect to ${endpoint}:`, err);
      }
    }
    
    // If all fallbacks fail, throw an error
    throw new Error("Failed to connect to any Solana RPC endpoint");
  }
};

export default function WalletTransactionHandler({
  minAmount = 0.05,
  maxAmount = 10,
  onSuccess,
  onError,
  inputLabel = "Amount (SOL)",
  buttonLabel = "Contribute",
  tier = 'public'
}: TransactionHandlerProps) {
  const { connection } = useConnection()
  const wallet = useWallet()
  const { publicKey, connected, sendTransaction } = wallet
  const { toast } = useToast()
  const [amount, setAmount] = useState<number>(minAmount)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null)
  const [displayedAddress, setDisplayedAddress] = useState<string>("")
  
  // Log wallet state on mount and changes
  useEffect(() => {
    console.log("Wallet state changed:");
    console.log("- Connected:", connected);
    console.log("- Wallet:", (wallet as any)?.adapter?.name);
    console.log("- PublicKey:", publicKey?.toString());
  }, [connected, wallet, publicKey]);
  
  // Validate amount
  const isValidAmount = amount >= minAmount && amount <= maxAmount
  
  // Format wallet address for display
  useEffect(() => {
    if (publicKey) {
      const address = publicKey.toString();
      setDisplayedAddress(address.substring(0, 4) + '...' + address.substring(address.length - 4));
    } else {
      setDisplayedAddress("");
    }
  }, [publicKey]);
  
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

      console.log("Starting transaction process...");
      console.log(`Connection object exists: ${!!connection}`);
      
      // Use reliable fallback RPC endpoints
      const fallbackRpcEndpoints = [
        "https://solana-mainnet.g.alchemy.com/v2/demo", // Try Alchemy's endpoint first
        "https://solana-api.projectserum.com", // Try Project Serum endpoint
        "https://api.mainnet-beta.solana.com", // Try public endpoint
        "https://rpc.ankr.com/solana", // Ankr endpoint
        "https://rpc.helius.xyz/?api-key=28cda6d9-5527-4c12-a0b3-cf2c6e54c1a4",
        "https://solana-mainnet.phantom.tech/YBPpkkN4g91xDiAnTE9r0RcMkjg0sKUIWvAfoFVJ",
        "https://solana-api.syndica.io/access-token/9iDftHLv5zEEVAoZt8PVTCx369RxJ845xdMu9UGevAGg9YdwzaiJpBzZGrL9vt3N/rpc",
        "https://boldest-empty-bridge.solana-mainnet.quiknode.pro/4d8d5aa933a5aee3c9e72cf7119e279026eb4f11/"
      ];
      
      // Get the best available connection
      console.log("Finding best RPC connection...");
      const bestConnection = await getBestConnection(connection, fallbackRpcEndpoints);
      console.log("Found working RPC connection!");

      // Get latest blockhash
      console.log("Getting latest blockhash...");
      const { blockhash, lastValidBlockHeight } = await bestConnection.getLatestBlockhash("finalized");
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

      // APPROACH 1: Try using Phantom's native method directly (if available)
      if (typeof window !== 'undefined' && 'solana' in window) {
        const phantomWallet = window.solana as PhantomWallet;
        if (phantomWallet?.isPhantom) {
          try {
            console.log("Using Phantom's native transaction method...");
            await phantomWallet.connect(); // Ensure connection is fresh
            signature = await phantomWallet.signAndSendTransaction(transaction);
            console.log("Phantom transaction sent:", signature);
          } catch (phantomError) {
            console.warn("Phantom native method failed:", phantomError);
            // Don't throw, let it fall through to adapter method
          }
        }
      }

      // APPROACH 2: If Phantom method wasn't available or failed, try wallet adapter hook
      if (!signature) {
        try {
          console.log("Using wallet adapter sendTransaction hook...");
          signature = await sendTransaction(transaction, bestConnection);
          console.log("Hook transaction sent:", signature);
        } catch (adapterError) {
          console.warn("Wallet adapter hook failed:", adapterError);
          // Don't throw, try the next method
        }
      }

      // APPROACH 3: Direct adapter call as last resort
      if (!signature && (wallet as any)?.adapter?.sendTransaction) {
        try {
          console.log("Using wallet adapter directly...");
          signature = await (wallet as any).adapter.sendTransaction(transaction, bestConnection);
          console.log("Direct adapter transaction sent:", signature);
        } catch (adapterError) {
          console.error("All wallet methods failed:", adapterError);
          throw adapterError;
        }
      }

      if (!signature) {
        throw new Error("No wallet method available to send transaction");
      }

      // Wait for confirmation
      console.log("Waiting for confirmation...");
      const confirmationResponse = await bestConnection.confirmTransaction({
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
          disabled={!connected || !isValidAmount || isSubmitting}
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