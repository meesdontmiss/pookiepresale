"use client"

import { useState } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { Check, ExternalLink, Info } from "lucide-react"
import { playSound } from "@/hooks/use-audio"
import { Input } from "@/components/ui/input"
import dynamic from "next/dynamic"

// Dynamically import the fireworks component 
const FireworksEffect = dynamic(() => import('@/components/fireworks-effect'), { 
  ssr: false,
  loading: () => null
})

// Success sound path
const SUCCESS_SOUND_PATH = '/sounds/notification.wav'

// Define constant for custom event
const PROGRESS_UPDATE_EVENT = 'pookie-progress-update';
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || "4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh";

// Predefined SOL contribution amounts
const PUBLIC_CONTRIBUTION_AMOUNT = 0.25
const PRIVATE_CONTRIBUTION_OPTIONS = [0.5, 1.0, 1.5, 2.0]

// Format wallet address for display
const formatWalletAddress = (address: string): string => {
  if (!address) return ''
  return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`
}

// Function to monitor treasury wallet balance
const monitorTreasuryBalance = async () => {
  try {
    if (typeof window === 'undefined') return null;
    
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

// This is a mock function - in production, this would call a server action
const verifyPassword = async (password: string) => {
  // For demo purposes only - in production, this would be a server-side check
  return new Promise<{ success: boolean }>((resolve) => {
    setTimeout(() => {
      // The correct password would be stored securely on the server
      // This is just for demonstration
      resolve({ success: password === "pookiemafia" })
    }, 1000)
  })
}

export default function PreSaleForm() {
  const { publicKey, signTransaction, connected } = useWallet()
  const [selectedAmount, setSelectedAmount] = useState<number>(0.25)
  const [isPrivateSale, setIsPrivateSale] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasswordVerified, setIsPasswordVerified] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [password, setPassword] = useState("")
  const [isVerifying, setIsVerifying] = useState(false)
  const [showCelebration, setShowCelebration] = useState(false)
  const { toast } = useToast()

  const handleVerifyPassword = async () => {
    if (!password) return;
    
    setIsVerifying(true);
    try {
      const response = await verifyPassword(password);
      
      if (response.success) {
        // Show explosion effect
        setShowCelebration(true);
        
        // Play success sound
        playSound(SUCCESS_SOUND_PATH);
        
        // Show success toast
        toast({
          title: "Cap increased!",
          description: "Your contribution cap has been increased to 2.0 SOL",
        });
        
        // Update state after explosion completes
        setTimeout(() => {
          setShowCelebration(false);
          setIsPasswordVerified(true);
          setShowPasswordForm(false);
        }, 3000);
      } else {
        toast({
          title: "Invalid phrase",
          description: "The secret phrase you entered is incorrect",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An error occurred while verifying the password",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleContribute = async () => {
    if (!publicKey || !connected) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet first",
        variant: "destructive"
      })
      return
    }

    setIsSubmitting(true)
    try {
      // Get treasury wallet address from environment variables
      const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET
      
      if (!treasuryWallet) {
        throw new Error('Treasury wallet not configured')
      }
      
      // Display preparing transaction toast
      toast({
        title: "Preparing transaction",
        description: `Please approve the transaction for ${selectedAmount} SOL in your wallet`,
      })
      
      // Use @solana/web3.js to create and send the transaction
      const { Connection, SystemProgram, Transaction, PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js')
      
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
          lamports: selectedAmount * LAMPORTS_PER_SOL, // Convert SOL to lamports
        })
      )
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash()
      transaction.recentBlockhash = blockhash
      transaction.feePayer = publicKey
      
      // Send transaction
      if (!signTransaction) {
        throw new Error('Wallet does not support signTransaction')
      }
      
      const signedTransaction = await signTransaction(transaction)
      const signature = await connection.sendRawTransaction(signedTransaction.serialize())
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed')
      
      // Play success sound
      playSound('/sounds/notification.wav')
      
      toast({
        title: "Transaction sent!",
        description: "Verifying your contribution...",
      })
      
      // Verify with our API
      const verifyResponse = await fetch('/api/transactions/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signature,
          walletAddress: publicKey.toString(),
          amount: selectedAmount,
          tier: isPrivateSale ? "core" : "public",
        }),
      })
      
      if (!verifyResponse.ok) {
        throw new Error('Failed to verify transaction')
      }
      
      // Manually trigger a live notification for immediate feedback
      const notificationEvent = new CustomEvent('pookie-new-contribution', { 
        detail: {
          wallet: formatWalletAddress(publicKey.toString()),
          amount: selectedAmount,
          timestamp: Date.now()
        }
      });
      window.dispatchEvent(notificationEvent);
      
      // Show success notification with transaction link
      toast({
        title: "Contribution successful!",
        description: (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1 text-green-500">
              <Check size={16} className="flex-shrink-0" />
              <span>Transaction confirmed on Solana blockchain</span>
            </div>
            <p>You contributed {selectedAmount} SOL to the POOKIE presale.</p>
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
        duration: 8000,
      })
      
      // Immediately refresh the presale stats to update the progress bar
      refreshPresaleStats()
      
      setSelectedAmount(0.25)
      
    } catch (error) {
      console.error("Contribution error:", error)
      toast({
        title: "Transaction failed",
        description: error instanceof Error ? error.message : "Failed to complete transaction",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="w-full px-2 py-4">
      {showCelebration && (
        <div className="fixed inset-0 flex items-center justify-center z-[100] pointer-events-none">
          <FireworksEffect 
            duration={3000} 
            particleCount={40} 
            burstCount={10} 
            imagePath="/images/pookie-flag.png"
          />
        </div>
      )}
    
      {!connected ? (
        <div className="flex flex-col items-center space-y-4">
          <p className="text-center text-sm mb-2">Connect your wallet to participate in the presale</p>
          <WalletMultiButton className="bg-green-500 hover:bg-green-600 text-white rounded-md h-10" />
        </div>
      ) : showPasswordForm ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Enter the secret phrase to increase your cap from 0.25 to 2.0 SOL.</p>
          <div className="flex gap-2">
            <Input
              type="password"
              placeholder="Secret phrase"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="flex-1 h-8 text-sm"
              size={10}
            />
            <Button 
              onClick={handleVerifyPassword} 
              disabled={!password || isVerifying} 
              size="sm" 
              className="h-8"
            >
              {isVerifying ? "..." : "Verify"}
            </Button>
          </div>
          <Button 
            className="text-xs p-0 h-6 mt-1" 
            onClick={() => setShowPasswordForm(false)}
            variant="link"
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-sm font-medium">Sale Type:</span>
              <div className="flex space-x-2">
                <Button 
                  className={`text-xs px-2 py-1 h-7 ${!isPrivateSale ? 'bg-green-500' : 'bg-zinc-700'}`}
                  onClick={() => {
                    setIsPrivateSale(false);
                    setSelectedAmount(PUBLIC_CONTRIBUTION_AMOUNT);
                  }}
                >
                  Public
                </Button>
                <Button 
                  className={`text-xs px-2 py-1 h-7 ${isPrivateSale ? 'bg-green-500' : 'bg-zinc-700'}`}
                  onClick={() => {
                    if (isPasswordVerified) {
                      setIsPrivateSale(true);
                      setSelectedAmount(0.5);
                    } else {
                      setShowPasswordForm(true);
                    }
                  }}
                >
                  Private
                </Button>
              </div>
            </div>
            
            <div className="mb-4">
              <span className="text-sm font-medium block mb-2">Amount:</span>
              <div className="grid grid-cols-2 gap-2">
                {isPrivateSale && isPasswordVerified ? (
                  PRIVATE_CONTRIBUTION_OPTIONS.map((amount) => (
                    <Button
                      key={amount}
                      variant={selectedAmount === amount ? "default" : "outline"}
                      className={`text-sm ${selectedAmount === amount ? 'bg-green-500' : 'bg-zinc-800'}`}
                      onClick={() => setSelectedAmount(amount)}
                    >
                      {amount} SOL
                    </Button>
                  ))
                ) : (
                  <Button
                    variant="default"
                    className="text-sm bg-green-500"
                    onClick={() => setSelectedAmount(PUBLIC_CONTRIBUTION_AMOUNT)}
                  >
                    {PUBLIC_CONTRIBUTION_AMOUNT} SOL
                  </Button>
                )}
              </div>
            </div>
            
            {!isPasswordVerified && (
              <div className="flex items-start gap-2 rounded-md bg-muted p-2 text-xs mb-4">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">Unlock Higher Caps</p>
                  <p className="mt-1 text-muted-foreground">
                    Know the secret phrase? <Button variant="link" onClick={() => setShowPasswordForm(true)} className="h-auto p-0 text-xs">Click here</Button> to unlock private sale with higher caps.
                  </p>
                </div>
              </div>
            )}
          </div>
          
          <Button
            className="w-full bg-green-500 hover:bg-green-600 text-white"
            disabled={isSubmitting || !selectedAmount}
            onClick={handleContribute}
          >
            {isSubmitting ? "Processing..." : `Contribute ${selectedAmount} SOL`}
          </Button>
          
          <p className="text-xs text-center text-gray-400 mt-2">
            Your tokens will be distributed at TGE
          </p>
        </div>
      )}
    </div>
  )
} 