"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PookieScene } from "@/components/pookie-scene"
import Link from "next/link"
import { ImageIcon, ChevronUpIcon, ChevronDownIcon, TwitterIcon, MessageCircleIcon } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import type { ButtonProps } from "@/components/ui/button"
import { playClickSound, playSound } from "@/hooks/use-audio"
import { MusicPlayer } from "@/components/music-player"

// Click sound path
const CLICK_SOUND_PATH = '/sounds/click-sound-1.mp3'

// Sound-enabled button that plays click sound on press
const SoundButton = ({ onClick, ...props }: ButtonProps & { onClick?: () => void }) => {
  const handleClick = () => {
    // No need for explicit playClickSound here - global handler will catch it
    if (onClick) onClick()
  }
  
  return <Button {...props} onClick={handleClick} />
}

export default function Home() {
  // Use a single "mounted" state to track client-side rendering
  const [mounted, setMounted] = useState(false)
  const { connected } = useWallet()
  const [minimized, setMinimized] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const [velocity, setVelocity] = useState(0)
  const trailRef = useRef<{ x: number; y: number; timestamp: number }[]>([])
  const prevPosition = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)
  const [notifications, setNotifications] = useState<Array<{
    id: number,
    amount: number,
    wallet: string,
    timestamp: number
  }>>([])
  
  // Set mounted to true on component mount to prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Subscribe to real-time updates for presale stats
  useEffect(() => {
    if (!mounted) return;
    
    // Initialize Supabase client for real-time updates
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase credentials not available');
      return;
    }
    
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Subscribe to all changes on contributions table
    const subscription = supabase
      .channel('public:contributions')
      .on('INSERT', () => {
        // Handle new contributions for notifications if needed
      })
      .subscribe();
    
    return () => {
      subscription.unsubscribe();
    };
  }, [mounted]);

  // Format wallet address for display
  const formatWalletAddress = (address: string): string => {
    if (!address) return '';
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  };
  
  // Mouse tracking for 3D model interactivity
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      // Store the event for later processing in animation frame
      const mouseX = event.clientX;
      const mouseY = event.clientY;
      
      // Add to the trail
      const timestamp = Date.now();
      trailRef.current.push({ x: mouseX, y: mouseY, timestamp });
      
      // Limit trail length
      if (trailRef.current.length > 10) {
        trailRef.current.shift();
      }
    };
    
    const updateMousePosition = () => {
      // Continue the animation loop
      rafRef.current = requestAnimationFrame(updateMousePosition);
      
      // Skip if no movement recorded yet
      if (trailRef.current.length === 0) return;
      
      // Get the latest position
      const latest = trailRef.current[trailRef.current.length - 1];
      
      // Calculate velocity based on recent movement
      let vx = 0;
      let vy = 0;
      let totalPoints = 0;
      
      // Use the last 200ms of movement to calculate velocity
      const now = Date.now();
      const recentTrail = trailRef.current.filter(point => now - point.timestamp < 200);
      
      if (recentTrail.length >= 2) {
        const first = recentTrail[0];
        const last = recentTrail[recentTrail.length - 1];
        const deltaX = last.x - first.x;
        const deltaY = last.y - first.y;
        const deltaTime = (last.timestamp - first.timestamp) / 1000; // convert to seconds
        
        if (deltaTime > 0) {
          vx = deltaX / deltaTime;
          vy = deltaY / deltaTime;
        }
      }
      
      // Calculate the magnitude of velocity
      const velocityMagnitude = Math.sqrt(vx * vx + vy * vy);
      
      // Map velocity to a 0-1 range with some dampening
      const normalizedVelocity = Math.min(velocityMagnitude / 1000, 1);
      
      // Update state
      setMousePosition({ x: latest.x, y: latest.y });
      setVelocity(normalizedVelocity);
      
      // Store the current position for next frame
      prevPosition.current = { x: latest.x, y: latest.y };
      
      // Cleanup old trail points
      const oneSecondAgo = now - 1000;
      trailRef.current = trailRef.current.filter(point => point.timestamp > oneSecondAgo);
    };
    
    // Set up mouse tracking
    document.addEventListener('mousemove', handleMouseMove);
    rafRef.current = requestAnimationFrame(updateMousePosition);
    
    // Cleanup
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);
  
  // Listen for custom debug events
  useEffect(() => {
    const handleDebugKeypress = (e: KeyboardEvent) => {
      // Only in development
      if (process.env.NODE_ENV !== 'development') return;
      
      // Check for Alt+D to toggle debug tools
      if (e.key === 'd' && e.altKey) {
        // Navigate to debug page
        window.location.href = '/debug';
      }
    };
    
    window.addEventListener('keydown', handleDebugKeypress);
    return () => window.removeEventListener('keydown', handleDebugKeypress);
  }, []);

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
      {/* Notification System */}
      <div className="fixed top-20 right-4 z-[1000] pointer-events-none">
        <AnimatePresence>
          {notifications.map((notification) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, x: 100, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 100, scale: 0.8 }}
              transition={{ type: "spring", duration: 0.5 }}
              className="mb-2 bg-background/80 backdrop-blur-sm border border-primary/20 rounded-lg p-3 shadow-lg max-w-sm"
            >
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <div className="text-sm">
                  <span className="font-bold text-primary">{notification.wallet}</span>
                  <span className="text-muted-foreground"> just contributed </span>
                  <span className="font-bold">{notification.amount} SOL</span>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Simplified aura effect - optimized for performance */}
      <svg className="fixed top-0 left-0 w-full h-full pointer-events-none z-50">
        {gradientDef}
        
        {/* Main aura circle around the cursor - more optimized */}
        {mousePosition.x > 0 && (
          <circle
            cx={mousePosition.x}
            cy={mousePosition.y}
            r={25 + velocity * 1.5}
            fill="url(#auraGradient)"
            style={{ filter: 'blur(6px)' }}
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
        <PookieScene />
      </div>

      {/* Navigation links with improved clickability */}
      <div 
        className="fixed top-0 left-0 w-full z-[999]"
        style={{ 
          pointerEvents: "all",
        }}
      >
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative w-full border-b border-primary/20 bg-background/50 backdrop-blur supports-[backdrop-filter]:bg-background/30"
          style={{
            pointerEvents: "all"
          }}
        >
          <div className="container flex h-14 items-center justify-between py-2 pointer-events-auto">
            <motion.div 
              className="flex items-center gap-2"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
            >
              <img 
                src="/images/pookie-smashin.gif" 
                alt="Pookie Logo" 
                className="h-10 w-10" 
              />
              <span className="text-xl font-bold text-primary text-glow">$POOKIE</span>
            </motion.div>
            <div className="flex-1 flex justify-center items-center">
              <MusicPlayer />
            </div>
            <div className="flex items-center gap-3">
              <motion.div 
                whileHover={{ scale: 1.1 }} 
                whileTap={{ scale: 0.95 }}
                className="pointer-events-auto"
              >
                <Button 
                  className="h-8 bg-background/80 border-2 border-primary/70 text-primary hover:bg-primary/10 animate-glow"
                  onClick={(e) => {
                    // Stop event propagation to prevent the 3D scene from capturing it
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Keep navigation clicks that play sound before browser navigation
                    playClickSound();
                    
                    // Navigate after a tiny delay to ensure sound plays
                    setTimeout(() => {
                      window.location.href = '/gallery';
                    }, 10);
                  }}
                >
                  <ImageIcon size={16} className="mr-1 text-primary" />
                  <span className="text-xs">Gallery</span>
                </Button>
              </motion.div>
              <motion.div 
                whileHover={{ scale: 1.1 }} 
                whileTap={{ scale: 0.95 }}
                className="pointer-events-auto"
              >
                <Button 
                  className="h-8 bg-background/80 border-2 border-primary/70 text-primary hover:bg-primary/10 animate-glow"
                  onClick={(e) => {
                    // Stop event propagation to prevent the 3D scene from capturing it
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Keep navigation clicks that play sound before browser navigation
                    playClickSound();
                    
                    // Navigate after a tiny delay to ensure sound plays
                    setTimeout(() => {
                      window.location.href = '/staking';
                    }, 10);
                  }}
                >
                  <span className="text-xs">Staking</span>
                </Button>
              </motion.div>
              
              {/* Twitter Button */}
              <motion.div 
                whileHover={{ scale: 1.1 }} 
                whileTap={{ scale: 0.95 }}
                className="pointer-events-auto"
              >
                <a 
                  href="https://X.com/pookiethepeng"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-md bg-background/80 border-2 border-primary/70 text-primary hover:bg-primary/10 animate-glow"
                  onClick={(e) => {
                    // Stop event propagation to prevent the 3D scene from capturing it
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Play sound
                    playClickSound();
                    
                    // Navigate after a tiny delay to ensure sound plays
                    setTimeout(() => {
                      window.open("https://X.com/pookiethepeng", "_blank");
                    }, 10);
                  }}
                >
                  <TwitterIcon size={16} className="text-primary" />
                </a>
              </motion.div>
              
              {/* Telegram Button */}
              <motion.div 
                whileHover={{ scale: 1.1 }} 
                whileTap={{ scale: 0.95 }}
                className="pointer-events-auto"
              >
                <a 
                  href="https://t.me/pookiethepeng"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-md bg-background/80 border-2 border-primary/70 text-primary hover:bg-primary/10 animate-glow"
                  onClick={(e) => {
                    // Stop event propagation to prevent the 3D scene from capturing it
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Play sound
                    playClickSound();
                    
                    // Navigate after a tiny delay to ensure sound plays
                    setTimeout(() => {
                      window.open("https://t.me/pookiethepeng", "_blank");
                    }, 10);
                  }}
                >
                  <MessageCircleIcon size={16} className="text-primary" />
                </a>
              </motion.div>
              
              <motion.div 
                whileHover={{ scale: 1.05 }} 
                whileTap={{ scale: 0.95 }}
                onClick={() => playClickSound()}
                className="pointer-events-auto"
              >
                <WalletMultiButton className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1 h-8" />
              </motion.div>

              {/* Debug Button - only visible in development or when holding Alt key */}
              {process.env.NODE_ENV === 'development' && (
                <motion.div 
                  whileHover={{ scale: 1.1 }} 
                  whileTap={{ scale: 0.95 }}
                  className="pointer-events-auto"
                >
                  <Button 
                    className="h-8 bg-background/80 border border-gray-500 text-gray-500 hover:bg-gray-200/10"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      playClickSound();
                      setTimeout(() => {
                        window.location.href = '/debug';
                      }, 10);
                    }}
                  >
                    <span className="text-xs">Debug</span>
                  </Button>
                </motion.div>
              )}
            </div>
          </div>
        </motion.header>
      </div>

      {/* Original header (hidden) for layout purposes */}
      <motion.header 
        initial={{ opacity: 0 }}
        animate={{ opacity: 0 }}
        className="relative z-10 w-full border-b border-primary/20 bg-transparent pointer-events-none"
      >
        <div className="container flex h-14 items-center justify-between py-2 opacity-0">
          <div className="flex items-center gap-2">
            <span className="text-xl">$POOKIE</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-24"></div>
            <div className="h-8 w-20"></div>
            <div className="h-8 w-32"></div>
          </div>
        </div>
      </motion.header>

      {/* Main Content - empty to allow full interaction with the 3D model */}
      <div className="relative z-10 flex-1"></div>

      {/* Social Links Box - Enhanced UI */}
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20, transition: { duration: 1.5 } }}
          transition={{ duration: 0.5 }}
          className="absolute bottom-8 inset-x-0 mx-auto z-10 max-w-[480px] w-[calc(100%-2rem)]"
        >
          <div className="glass p-6 rounded-2xl border border-primary/20 shadow-xl backdrop-blur-lg overflow-hidden bg-background/70">
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-primary text-glow mb-1">$POOKIE</h2>
              <p className="text-sm text-foreground/70">
                damn pookie! how u waddle like that??
              </p>
            </div>

            {/* Contract Address Button - Reworked Layout */}
            <div className="mb-6"> {/* Increased bottom margin */}
              <motion.div 
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="w-full"
              >
                <button
                  className="relative flex flex-col items-center justify-between w-full border border-primary/40 text-primary font-semibold bg-gradient-to-br from-primary/10 via-background/50 to-primary/15 hover:from-primary/20 hover:to-primary/25 shadow-lg h-[88px] rounded-xl overflow-hidden transition-all duration-200 group p-3" // Increased height and added padding
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    playClickSound();
                    
                    const contractAddress = "TNgsEdyvc7i1fSBM8MYY9zfQXJdy1fZCA2aNuRr8GFM"; 
                    navigator.clipboard.writeText(contractAddress);
                    
                    const button = e.currentTarget;
                    button.classList.add("scale-[1.01]");
                    setTimeout(() => button.classList.remove("scale-[1.01]"), 200);
                    
                    const copyStatus = button.querySelector(".copy-status");
                    if (copyStatus) {
                      copyStatus.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg> Copied!`;
                      copyStatus.classList.add("text-primary", "font-bold");
                      
                      setTimeout(() => {
                        copyStatus.innerHTML = `Click to copy`;
                        copyStatus.classList.remove("text-primary", "font-bold");
                      }, 2500);
                    }
                  }}
                >
                  {/* Top Row: Icon + Title */}
                  <div className="flex items-center justify-center gap-2 w-full">
                    <span className="text-primary font-bold text-lg">📋</span>
                    <span className="text-md font-bold">Contract Address</span>
                  </div>
                  
                  {/* Middle Row: Address Preview */}
                  <div className="text-sm font-mono bg-black/20 backdrop-blur-sm px-4 py-1.5 rounded-lg w-fit shadow-inner my-1.5"> {/* Adjusted styling */}
                    TNgs...8GFM
                  </div>
                  
                  {/* Bottom Row: Copy Hint */}
                  <div className="copy-status text-xs text-foreground/60 group-hover:text-primary transition-colors w-full text-center">
                    Click to copy
                  </div>
                </button>
              </motion.div>
            </div>
            
            {/* Social Media & Chart Buttons - Centered Grid */}
            <div className="grid grid-cols-3 gap-4">
              {/* Twitter Button */}
              <motion.div 
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className="w-full"
              >
                <a
                  href="https://X.com/pookiethepeng"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full border border-primary/30 text-primary font-medium bg-background/50 hover:bg-primary/10 hover:border-primary/50 shadow-md h-12 rounded-xl transition-colors duration-200"
                  onClick={(e) => {
                    e.preventDefault(); e.stopPropagation(); playClickSound();
                    setTimeout(() => { window.open("https://X.com/pookiethepeng", "_blank"); }, 10);
                  }}
                >
                  <TwitterIcon size={18} className="text-primary/90" />
                  <span className="text-sm">Twitter</span>
                </a>
              </motion.div>
              
              {/* Telegram Button */}
              <motion.div 
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className="w-full"
              >
                <a
                  href="https://t.me/pookiethepeng"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full border border-primary/30 text-primary font-medium bg-background/50 hover:bg-primary/10 hover:border-primary/50 shadow-md h-12 rounded-xl transition-colors duration-200"
                  onClick={(e) => {
                    e.preventDefault(); e.stopPropagation(); playClickSound();
                    setTimeout(() => { window.open("https://t.me/pookiethepeng", "_blank"); }, 10);
                  }}
                >
                  <MessageCircleIcon size={18} className="text-primary/90" />
                  <span className="text-sm">Telegram</span>
                </a>
              </motion.div>
              
              {/* Dexscreener Button */}
              <motion.div 
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                className="w-full"
              >
                <a
                  href="https://dexscreener.com/solana/duk4vltdl2jtxw9x5e1ukqeipsrcrcasbphnzevvnzfu"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full border border-primary/30 text-primary font-medium bg-background/50 hover:bg-primary/10 hover:border-primary/50 shadow-md h-12 rounded-xl transition-colors duration-200"
                  onClick={(e) => {
                    e.preventDefault(); e.stopPropagation(); playClickSound();
                    setTimeout(() => { window.open("https://dexscreener.com/solana/duk4vltdl2jtxw9x5e1ukqeipsrcrcasbphnzevvnzfu", "_blank"); }, 10);
                  }}
                >
                  <span className="text-primary font-bold text-lg">📊</span>
                  <span className="text-sm">DEX</span>
                </a>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

