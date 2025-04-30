"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ChevronLeftIcon } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { ButtonProps } from "@/components/ui/button"
import { playClickSound, playSound } from "@/hooks/use-audio"
import { StakingScene } from "@/components/staking-scene"
import OnChainNftStaking from "@/components/on-chain-nft-staking"
import { useRouter } from "next/navigation"

// Click sound path
const CLICK_SOUND_PATH = '/sounds/click-sound.wav'

// Sound-enabled button that plays click sound on press
const SoundButton = ({ onClick, ...props }: ButtonProps & { onClick?: () => void }) => {
  const handleClick = () => {
    // Global handler will handle the click sound
    if (onClick) onClick()
  }
  
  return <Button {...props} onClick={handleClick} />
}

export default function StakingPage() {
  const [mounted, setMounted] = useState(false)
  const router = useRouter()
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  if (!mounted) {
    return (
      <div className="h-screen w-screen">
        <div className="w-full h-full bg-background flex items-center justify-center">
          <div className="text-primary">Loading...</div>
        </div>
      </div>
    )
  }
  
  return (
    <div className="relative min-h-screen w-screen pt-20 pb-8 flex flex-col items-center justify-center px-4">
       {/* Removed SVG aura effect */}
       {/* Removed StakingScene background - assume page.tsx handles background */}
       {/* Removed redundant Header structure */}

       {/* Main Content - Staking Interface - Centered */} 
       <div className="relative z-10 w-full max-w-4xl flex-grow flex items-center justify-center">
         <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.5 }}
           className="glass p-6 rounded-lg border-glow shadow-glow w-full"
         >
           <div className="flex justify-between items-center mb-6">
             <h2 className="text-center text-2xl font-bold text-primary text-glow flex-1">
               NFT Staking
             </h2>
             <Button 
               variant="outline"
               size="sm"
               onClick={() => router.back()} 
               className="bg-background/80 border-primary/70 text-primary hover:bg-primary/20 hover:text-white"
             >
               <ChevronLeftIcon size={16} className="mr-1" />
               Back
             </Button>
           </div>
           <div className="space-y-4">
             <OnChainNftStaking />
           </div>
         </motion.div>
       </div>
    </div>
  )
} 