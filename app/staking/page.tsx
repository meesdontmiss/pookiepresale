"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { ChevronLeftIcon } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { ButtonProps } from "@/components/ui/button"
import { playClickSound, playSound } from "@/hooks/use-audio"
import { StakingScene } from "@/components/staking-scene"
import OnChainNftStaking from "@/components/on-chain-nft-staking"
import { MusicPlayer } from "@/components/music-player"
import { useRouter } from "next/navigation"
import { TwitterIcon } from "lucide-react"

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
  // Use a single "mounted" state to track client-side rendering
  const [mounted, setMounted] = useState(false)
  const { connected } = useWallet()
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [velocity, setVelocity] = useState(0)
  const [clickCount, setClickCount] = useState(0) // Debug click counter
  const trailRef = useRef<{ x: number; y: number; timestamp: number }[]>([])
  const prevPosition = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)
  const router = useRouter()
  
  // Set mounted to true on component mount to prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // More efficient cursor tracking with requestAnimationFrame
  useEffect(() => {
    if (!mounted) return
    
    let lastMousePosition = { x: 0, y: 0 };
    let isMoving = false;
    
    const handleMouseMove = (event: MouseEvent) => {
      lastMousePosition = {
        x: event.clientX,
        y: event.clientY
      };
      isMoving = true; 
    };
    
    const updateMousePosition = () => {
      if (isMoving) {
        const dx = lastMousePosition.x - prevPosition.current.x;
        const dy = lastMousePosition.y - prevPosition.current.y;
        const currentVelocity = Math.sqrt(dx * dx + dy * dy) * 0.1;
        
        setMousePosition(lastMousePosition);
        setVelocity(Math.min(currentVelocity, 8));
        
        // Only add trail points when moving with some velocity
        if (currentVelocity > 0.5) {
          const now = Date.now();
          trailRef.current.push({ 
            ...lastMousePosition, 
            timestamp: now
          });
          
          // Keep fewer points for a shorter trail
          trailRef.current = trailRef.current
            .filter(point => now - point.timestamp < 150)
            .slice(-3);
        }
        
        prevPosition.current = lastMousePosition;
        isMoving = false;
      }
      
      rafRef.current = requestAnimationFrame(updateMousePosition);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    rafRef.current = requestAnimationFrame(updateMousePosition);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [mounted]);
  
  // Add global click sound handler
  useEffect(() => {
    if (!mounted) return;
    
    // We're removing this handler to prevent conflicts with the Back Home button
    // and because the GlobalSoundProvider already handles click sounds
    
    return () => {};
  }, [mounted]);

  // Memoize gradient definition to avoid recreation
  const gradientDef = useMemo(() => (
    <defs>
      <radialGradient id="auraGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
        <stop offset="0%" stopColor="#00ff88" stopOpacity="0.6" />
        <stop offset="70%" stopColor="#00ff88" stopOpacity="0" />
      </radialGradient>
    </defs>
  ), []);

  // Don't render custom cursor or animations until client-side
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
    <div className="relative h-screen w-screen overflow-hidden flex flex-col">
      {/* Simplified aura effect - optimized for performance */}
      <svg className="fixed top-0 left-0 w-full h-full pointer-events-none z-10">
        {gradientDef}
        
        {/* Main aura circle around the cursor - more optimized */}
        {mousePosition.x > 0 && (
          <circle
            cx={mousePosition.x}
            cy={mousePosition.y}
            r={25 + velocity * 1.5}
            fill="url(#auraGradient)"
            style={{ filter: 'blur(6px)' }}
            pointerEvents="none"
          />
        )}
        
        {/* Reduced particle count for better performance */}
        {trailRef.current.map((point, i) => {
          // Size based on position in trail (newer points are larger)
          const size = 4 - i;
          
          return (
            <circle
              key={`p-${point.timestamp}`}
              cx={point.x}
              cy={point.y}
              r={size}
              fill="#00ff88"
              opacity={0.3}
            />
          );
        })}
      </svg>

      {/* 3D Scene as Background - takes up the full screen */}
      <div className="absolute inset-0 z-0">
        <StakingScene />
      </div>

      {/* Header with simplified implementation */}
      <div className="relative z-50 w-full border-b border-primary/20 bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/30">
        <div className="container flex h-16 items-center justify-between py-2">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img 
              src="/images/pookie-smashin.gif" 
              alt="Pookie Logo" 
              className="h-10 w-10" 
            />
            <span className="text-xl font-bold text-primary text-glow">$POOKIE</span>
          </div>
          
          {/* Music Player */}
          <div className="flex-1 flex justify-center items-center z-50">
            <MusicPlayer />
          </div>
          
          {/* Nav buttons */}
          <div className="flex items-center gap-3 z-50">
            {/* Back Home button */}
            <Link 
              href="/"
              // Global handler will handle the click sound
              className="inline-flex items-center h-8 px-3 py-1 rounded-md bg-background/80 border-2 border-primary/70 text-primary hover:bg-primary/20 hover:text-white cursor-pointer"
            >
              <ChevronLeftIcon size={16} className="mr-1" />
              <span className="text-xs">Back Home</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content - Staking Interface */}
      <div className="relative z-10 flex-1 flex items-center justify-center">
        <div className="max-w-4xl w-full px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="glass p-6 rounded-lg border-glow shadow-glow"
          >
            {/* Render on-chain NFT Staking */}
            <h2 className="text-center text-2xl font-bold text-primary text-glow mb-6">NFT Staking</h2>
            <div className="space-y-4">
              <OnChainNftStaking />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
} 