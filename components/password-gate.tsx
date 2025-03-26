"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"
import { playClickSound, playSound } from "@/hooks/use-audio"
import dynamic from "next/dynamic"

// Dynamically import the fireworks component 
const FireworksEffect = dynamic(() => import('@/components/fireworks-effect'), { 
  ssr: false,
  loading: () => null
})

// Sound path
const SUCCESS_SOUND_PATH = '/sounds/notification.wav'

interface PasswordGateProps {
  onVerified: () => void
}

export default function PasswordGate({ onVerified }: PasswordGateProps) {
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showExplosion, setShowExplosion] = useState(false)

  const handleVerify = async () => {
    setIsLoading(true)

    try {
      const response = await verifyPassword(password)

      if (response.success) {
        // Show explosion effect
        setShowExplosion(true)
        
        // Play success sound
        playCelebrationSound()
        
        // Show success toast
        toast({
          title: "Cap increased!",
          description: "Your contribution cap has been increased to 2.0 SOL",
        })
        
        // Call onVerified after explosion completes
        setTimeout(() => {
          setShowExplosion(false)
          onVerified()
        }, 3000)
      } else {
        toast({
          title: "Invalid phrase",
          description: "The secret phrase you entered is incorrect",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An error occurred while verifying the password",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
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

  // Play a single celebration sound
  const playCelebrationSound = () => {
    // Single sound at a lower volume
    playSound(SUCCESS_SOUND_PATH, 0.3)
  }

  return (
    <>
      {showExplosion && (
        <div className="fixed inset-0 flex items-center justify-center z-[100]">
          <FireworksEffect 
            duration={3000} 
            particleCount={40} 
            burstCount={10} 
            imagePath="/images/pookie-flag.png"
          />
        </div>
      )}

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
            onClick={handleVerify} 
            disabled={!password || isLoading} 
            size="sm" 
            className="h-8"
          >
            {isLoading ? "..." : "Verify"}
          </Button>
        </div>
      </div>
    </>
  )
}

