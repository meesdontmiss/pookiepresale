"use client"

import { useState, useEffect } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  LAMPORTS_PER_SOL,
  clusterApiUrl
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

// Local RPC proxy URL - avoids CORS issues
const RPC_PROXY_URL = '/api/rpc/proxy';

// Custom Connection class that uses our server-side proxy
class ProxyConnection extends Connection {
  constructor() {
    // Use any URL here, it will be overridden by our fetch implementation
    super('https://api.mainnet-beta.solana.com');
  }

  async _fetch(method: string, params: any) {
    try {
      console.log(`ProxyConnection: calling ${method}`, params);
      
      const response = await fetch(RPC_PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now().toString(),
          method,
          params,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
      }
      
      return data.result;
    } catch (error) {
      console.error('ProxyConnection fetch error:', error);
      throw error;
    }
  }

  // Override the required methods to use our proxy
  override async getLatestBlockhash(commitment?: any): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
    const result = await this._fetch('getLatestBlockhash', [{ commitment: commitment || 'finalized' }]);
    return {
      blockhash: result.blockhash,
      lastValidBlockHeight: result.lastValidBlockHeight,
    };
  }
  
  override async getBlockHeight(commitment?: any): Promise<number> {
    return this._fetch('getBlockHeight', [{ commitment: commitment || 'finalized' }]);
  }
  
  override async confirmTransaction(
    signatureOrConfirmOptions: any,
    commitment?: any
  ): Promise<any> {
    try {
      let params;
      
      if (typeof signatureOrConfirmOptions === 'string') {
        params = [signatureOrConfirmOptions, { commitment: commitment || 'confirmed' }];
      } else {
        params = [{
          signature: signatureOrConfirmOptions.signature,
          blockhash: signatureOrConfirmOptions.blockhash,
          lastValidBlockHeight: signatureOrConfirmOptions.lastValidBlockHeight
        }, commitment || 'confirmed'];
      }
      
      const result = await this._fetch('confirmTransaction', params);
      
      // Return in the format expected by wallet-adapter
      return {
        context: { slot: 0 },
        value: { err: result?.err || null }
      };
    } catch (error) {
      console.error('Error confirming transaction:', error);
      // Return a default response structure on error
      return {
        context: { slot: 0 },
        value: { err: 'Failed to confirm transaction' }
      };
    }
  }
}

// Create a singleton proxy connection
const proxyConnection = new ProxyConnection();

// Destination wallet for the presale
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || "4FdhCrDhcBcXyqLJGANnYbRiJyp1ApbQvXA1PYJXmdCG"

// Log environment variables at runtime
console.log("Environment variables loaded:");
console.log("- TREASURY_WALLET:", TREASURY_WALLET);
console.log("- RPC_URL:", process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
console.log("- Using RPC Proxy:", RPC_PROXY_URL);

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
  const { connection: defaultConnection } = useConnection()
  const wallet = useWallet()
  const { publicKey, connected, sendTransaction } = wallet
  const { toast } = useToast()
  const [amount, setAmount] = useState<number>(minAmount)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [transactionSignature, setTransactionSignature] = useState<string | null>(null)
  const [displayedAddress, setDisplayedAddress] = useState<string>("")
  
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

      // Handle transaction directly with wallet adapter
      console.log("Sending transaction...");
      let signature;
      
      try {
        // Use default connection from wallet adapter
        signature = await sendTransaction(transaction, defaultConnection);
        console.log("Transaction sent:", signature);
        
        // Transaction successful
        setTransactionSignature(signature);
        
        // Verify transaction in backend
        await verifyTransaction(signature, publicKey.toString(), amount);
        
        playSound(SUCCESS_SOUND_PATH, 0.3);
        
        toast({
          title: "Contribution successful!",
          description: `Thank you for contributing ${amount} SOL. You'll receive your tokens during the airdrop.`,
        });

        if (onSuccess) onSuccess(signature, amount);
      } catch (error) {
        console.error("Transaction error:", error);
        toast({
          title: "Transaction failed",
          description: error instanceof Error ? error.message : "Please try again later",
          variant: "destructive"
        });
        if (onError) onError(error instanceof Error ? error : new Error("Failed to send transaction"));
      }
    } catch (error) {
      console.error("Transaction setup error:", error);
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