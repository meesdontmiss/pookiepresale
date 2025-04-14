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

// Define constant for custom event - keep this for reference
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
  const [isPaused] = useState(true) // Always paused, no state setter
  const { toast } = useToast()

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
    toast({
      title: "Presale Concluded",
      description: "The presale has finished.",
      variant: "default"
    })
    return
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
            className="w-full bg-zinc-600 hover:bg-zinc-600 text-white cursor-not-allowed"
            disabled={true}
            onClick={handleContribute}
          >
            Presale Concluded
          </Button>
          
          <p className="text-xs text-center text-gray-400 mt-2">
            The presale is now closed. Thank you for your support!
          </p>
        </div>
      )}
    </div>
  )
} 