"use client"

import { useState, useEffect } from "react"
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

// Function to fetch final presale stats or treasury balance
const fetchFinalState = async () => {
  let finalRaised = 0;
  let finalCap = 0;
  let finalContributors = null;

  try {
    // First, try fetching the official stats from the API
    const statsResponse = await fetch('/api/presale/stats');
    if (statsResponse.ok) {
      const statsData = await statsResponse.json();
      if (statsData.success && statsData.stats) {
        finalRaised = Number(statsData.stats.total_raised || 0);
        // Since presale is paused, the cap IS the final raised amount
        finalCap = finalRaised;
        finalContributors = Number(statsData.stats.contributors || 0);
        console.log(`Fetched final stats from API: Raised ${finalRaised}, Cap ${finalCap}`);
      }
    }
    // Throw an error if stats fetch failed or returned invalid data, to trigger fallback
    if (finalCap <= 0 && finalRaised <= 0) {
        throw new Error("Stats API did not return valid final amount.")
    }

  } catch (statsError) {
    console.warn("Failed to fetch final stats from API, falling back to treasury balance:", statsError);
    // Fallback: Try fetching the balance directly from the treasury wallet
    try {
       if (typeof window !== 'undefined') {
            const { Connection, PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
            const baseUrl = window.location.origin;
            const connection = new Connection(`${baseUrl}/api/rpc/proxy`, 'confirmed');
            const treasuryBalance = await connection.getBalance(new PublicKey(TREASURY_WALLET));
            finalRaised = treasuryBalance / LAMPORTS_PER_SOL;
            // Cap is still the final raised amount
            finalCap = finalRaised;
            console.log(`Fetched final state from treasury balance: Raised ${finalRaised}, Cap ${finalCap}`);
       }
    } catch (balanceError) {
        console.error("Fallback failed: Error fetching treasury balance:", balanceError);
        // If both methods fail, leave values as 0
        finalRaised = 0;
        finalCap = 0;
    }
  }

  // Dispatch the event with the determined final state
  // Ensure cap always equals raised for paused state
  const event = new CustomEvent(PROGRESS_UPDATE_EVENT, {
    detail: {
      raised: finalRaised,
      cap: finalCap,
      contributors: finalContributors
    }
  });
  window.dispatchEvent(event);
  console.log(`Dispatched final state: Raised ${finalRaised}, Cap ${finalCap}`);

  return { raised: finalRaised, cap: finalCap, contributors: finalContributors };
};

// This is a mock function - in production, this would call a server action
const verifyPassword = async (password: string) => {
  // For demo purposes only - in production, this would be a server-side check
  return new Promise<{ success: boolean }>((resolve) => {
    setTimeout(() => {
      // The correct password would be stored securely on the server
      // This is just for demonstration
      resolve({ success: password === "damnpookie!" })
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
  const [isPaused, setIsPaused] = useState(true); // Keep this state, hardcoded to true
  const { toast } = useToast()

  // Simplified useEffect: Fetch final state on mount
  useEffect(() => {
    fetchFinalState();
    // No interval needed as the state is final
  }, []); // Empty dependency array, runs only once on mount

  const handleVerifyPassword = async () => {
    // Verification doesn't make sense if paused, but keep the disabled logic
    if (isPaused) return;
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
    // Contribution button is already disabled by isPaused, but double-check
    if (isPaused) {
      toast({
        title: "Presale Concluded",
        description: "The presale has finished.",
        variant: "default"
      })
      return;
    }
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
                  disabled={isPaused} // Disable button
                  onClick={() => {
                    setIsPrivateSale(false);
                    setSelectedAmount(PUBLIC_CONTRIBUTION_AMOUNT);
                  }}
                >
                  Public
                </Button>
                <Button 
                  className={`text-xs px-2 py-1 h-7 ${isPrivateSale ? 'bg-green-500' : 'bg-zinc-700'}`}
                  disabled={isPaused} // Disable button
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
                      disabled={isPaused} // Disable button
                      onClick={() => setSelectedAmount(amount)}
                    >
                      {amount} SOL
                    </Button>
                  ))
                ) : (
                  <Button
                    variant="default"
                    className="text-sm bg-green-500"
                    disabled={isPaused} // Disable button
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
                    Know the secret phrase? <Button variant="link" onClick={() => setShowPasswordForm(true)} className="h-auto p-0 text-xs" disabled={isPaused}>Click here</Button> to unlock private sale with higher caps.
                  </p>
                </div>
              </div>
            )}
          </div>
          
          <Button
            className="w-full bg-green-500 hover:bg-green-600 text-white"
            disabled={isPaused || isSubmitting || !selectedAmount} // Ensure disabled when paused
            onClick={handleContribute}
          >
            {isPaused ? "Presale Concluded" : isSubmitting ? "Processing..." : `Contribute ${selectedAmount} SOL`}
          </Button>
          
          <p className="text-xs text-center text-gray-400 mt-2">
            Your tokens will be distributed at TGE
          </p>
        </div>
      )}
    </div>
  )
} 