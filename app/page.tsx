"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useWallet } from "@solana/wallet-adapter-react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import PasswordGate from "@/components/password-gate"
import ContributionForm from "@/components/contribution-form"
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
  const [isPasswordVerified, setIsPasswordVerified] = useState(false)
  const [showPresale, setShowPresale] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
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
  
  // Update the presale progress values for production
  const [presaleStats, setPresaleStats] = useState({
    raised: 0,
    cap: 75,
    contributors: 0
  });

  // Set mounted to true on component mount to prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])
  
  // Fetch initial presale stats
  useEffect(() => {
    if (!mounted) return;
    
    const fetchPresaleStats = async () => {
      try {
        const response = await fetch('/api/presale/stats');
        if (!response.ok) throw new Error('Failed to fetch presale stats');
        
        const data = await response.json();
        if (data.success) {
          setPresaleStats({
            raised: Number(data.stats.total_raised || 0),
            cap: Number(data.stats.cap || 75),
            contributors: Number(data.stats.contributors || 0)
          });
        }
      } catch (error) {
        console.error('Error fetching presale stats:', error);
      }
    };
    
    fetchPresaleStats();
    
    // Set up an interval to periodically update the stats
    const intervalId = setInterval(fetchPresaleStats, 30000); // Update every 30 seconds
    
    return () => clearInterval(intervalId);
  }, [mounted]);

  // Function to monitor the treasury wallet balance directly
  const checkTreasuryWalletBalance = async () => {
    try {
      if (typeof window === 'undefined') return;
      
      const { Connection, PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
      const baseUrl = window.location.origin;
      const connection = new Connection(`${baseUrl}/api/rpc/proxy`, 'confirmed');
      
      // Treasury wallet address
      const treasuryWallet = process.env.NEXT_PUBLIC_TREASURY_WALLET || '4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh';
      
      // Get treasury balance
      const treasuryBalance = await connection.getBalance(new PublicKey(treasuryWallet));
      const solBalance = treasuryBalance / LAMPORTS_PER_SOL;
      
      console.log(`Treasury wallet balance: ${solBalance.toFixed(4)} SOL`);
      
      // Update presale stats with the real treasury balance
      setPresaleStats(prev => ({
        ...prev,
        raised: solBalance
      }));
      
      return solBalance;
    } catch (error) {
      console.error('Error checking treasury balance:', error);
      return null;
    }
  };
  
  // Set up periodic treasury wallet balance check
  useEffect(() => {
    if (!mounted) return;
    
    // Check wallet balance immediately
    checkTreasuryWalletBalance();
    
    // Then check every minute
    const walletCheckInterval = setInterval(checkTreasuryWalletBalance, 60000);
    
    return () => clearInterval(walletCheckInterval);
  }, [mounted]);

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
        // When a new contribution is made, refresh the stats
        fetchPresaleStats();
      })
      .on('UPDATE', () => {
        // When a contribution is updated, refresh the stats
        fetchPresaleStats();
      })
      .subscribe();
    
    // Function to fetch stats
    const fetchPresaleStats = async () => {
      try {
        const response = await fetch('/api/presale/stats');
        if (!response.ok) throw new Error('Failed to fetch presale stats');
        
        const data = await response.json();
        if (data.success) {
          setPresaleStats({
            raised: Number(data.stats.total_raised || 0),
            cap: Number(data.stats.cap || 75),
            contributors: Number(data.stats.contributors || 0)
          });
        }
      } catch (error) {
        console.error('Error fetching presale stats:', error);
      }
    };

    // Listen for custom progress update events from the contribution form
    const handleProgressUpdate = (event: CustomEvent) => {
      if (event.detail) {
        console.log('Progress update event received:', event.detail);
        setPresaleStats({
          raised: event.detail.raised || 0,
          cap: event.detail.cap || 75,
          contributors: event.detail.contributors || 0
        });
      }
    };

    // Add event listener
    window.addEventListener('pookie-progress-update', handleProgressUpdate as EventListener);
    
    // Cleanup function
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('pookie-progress-update', handleProgressUpdate as EventListener);
    };
  }, [mounted]);

  // Calculate progress percentage
  const presaleProgressPercent = Math.min(100, Math.round((presaleStats.raised / presaleStats.cap) * 100));

  // Add real-time notifications subscription for live transactions
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
    
    // Subscribe to new confirmed contributions
    const subscription = supabase
      .channel('public:contributions')
      .on('INSERT', (payload: any) => {
        const newContribution = payload.new;
        
        if (newContribution && newContribution.status === 'confirmed') {
          // Add a new notification
          setNotifications(prev => [
            {
              id: Date.now(),
              amount: newContribution.amount,
              wallet: formatWalletAddress(newContribution.wallet_address),
              timestamp: Date.now()
            },
            ...prev.slice(0, 4) // Keep only the latest 5 notifications
          ]);
          
          // Play notification sound
          playSound('/sounds/notification.wav');
        }
      })
      .subscribe();
    
    // Listen for custom contribution notifications from contribution form
    const handleDirectContribution = (event: CustomEvent) => {
      if (event.detail) {
        console.log('Direct contribution notification received:', event.detail);
        
        // Add the notification immediately
        setNotifications(prev => [
          {
            id: Date.now(),
            amount: event.detail.amount,
            wallet: event.detail.wallet,
            timestamp: event.detail.timestamp
          },
          ...prev.slice(0, 4) // Keep only the latest 5 notifications
        ]);
        
        // Play notification sound for immediate feedback
        playSound('/sounds/notification.wav');
      }
    };
    
    // Add event listener for direct contributions
    window.addEventListener('pookie-new-contribution', handleDirectContribution as EventListener);
    
    // Cleanup function
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('pookie-new-contribution', handleDirectContribution as EventListener);
    };
  }, [mounted]);

  // Format wallet address for display (e.g., "wallet1...xyz")
  const formatWalletAddress = (address: string): string => {
    if (!address) return '';
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`;
  };

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
  
  // We don't need a separate global click handler since GlobalSoundProvider does this
  useEffect(() => {
    if (!mounted) return;
    
    // Remove the global click sound handler - GlobalSoundProvider already does this
    
    return () => {};
  }, [mounted]);

  // Debug function to diagnose navigation issues
  useEffect(() => {
    if (!mounted) return;
    
    const handleDebugKeypress = (e: KeyboardEvent) => {
      // Use Alt+G and Alt+S as shortcuts to navigation in case buttons don't work
      if (e.altKey) {
        if (e.key === 'g') {
          playClickSound();
          window.location.href = '/gallery';
        } else if (e.key === 's') {
          playClickSound();
          window.location.href = '/staking';
        } else if (e.key === 'd') {
          // Debug page shortcut
          playClickSound();
          window.location.href = '/debug';
        }
      }
    };
    
    window.addEventListener('keydown', handleDebugKeypress);
    return () => window.removeEventListener('keydown', handleDebugKeypress);
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

  // Update the presale progress values for production
  const PRESALE_CAP = 75; // Maximum SOL to raise
  const PRESALE_RAISED = 0; // Start at 0 for production
  const PRESALE_PROGRESS_PERCENT = Math.min(100, Math.round((PRESALE_RAISED / PRESALE_CAP) * 100));

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
                  onClick={() => playClickSound()}
                  className="flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-primary"
                >
                  <TwitterIcon size={16} />
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

      {/* Sale Box - with animations */}
      <AnimatePresence>
        {(!showPresale) && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20, transition: { duration: 1.5 } }}
            transition={{ duration: 0.5 }}
            className="absolute bottom-8 left-0 right-0 mx-auto z-10 max-w-[500px] w-[calc(100%-2rem)]"
          >
            <div className="glass p-3 rounded-lg border-glow shadow-glow overflow-hidden">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-primary text-glow">$POOKIE Presale</h2>
                  <p className="text-sm text-foreground/80 mb-1">
                    PookieMafia is waiting. $Pookie presale will be live till 24hrs before launch
                  </p>
                </div>
                <div className="ml-2">
                  <div className="text-primary font-bold animate-pulse text-right flex items-center justify-end">
                    <span className="h-2.5 w-2.5 rounded-full bg-green-500 mr-1.5 shadow-[0_0_8px_#00ff88] animate-pulse"></span>
                    LIVE
                  </div>
                  <div className="text-xs font-semibold inline-block text-foreground/60 text-right">
                    {presaleStats.raised.toFixed(1)} / {presaleStats.cap} SOL
                  </div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-2 mt-1">
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Price:</span>
                    <span className="font-bold">0.25 - 2.0 SOL</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Your Cap:</span>
                    <span className="font-bold">{isPasswordVerified ? "2.0 SOL" : "0.25 SOL"}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>Raised:</span>
                    <span className="font-bold">{presaleStats.raised.toFixed(1)} SOL</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Progress:</span>
                    <span className="font-bold text-primary">{presaleProgressPercent}%</span>
                  </div>
                </div>
              </div>

              <div className="relative mb-3">
                <div className="overflow-hidden h-2 mb-1 text-xs flex rounded-full bg-background/50">
                  <motion.div 
                    style={{ width: `${presaleProgressPercent}%` }}
                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-primary"
                    initial={{ width: "0%" }}
                    animate={{ width: `${presaleProgressPercent}%` }}
                    transition={{ duration: 1, delay: 0.5 }}
                  />
                </div>
              </div>
              
              <div className="flex space-x-2">
                {showPasswordForm ? (
                  <div className="w-full">
                    <PasswordGate 
                      onVerified={() => {
                        setIsPasswordVerified(true);
                        setShowPasswordForm(false);
                        playClickSound();
                      }} 
                    />
                    <Button 
                      className="text-xs p-0 h-6 mt-1" 
                      onClick={() => {
                        setShowPasswordForm(false);
                        playClickSound();
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <motion.div 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-1/2"
                    >
                      <Button 
                        className="w-full border border-primary/50 text-primary font-medium bg-background/40 hover:bg-primary/10 shadow-sm h-10" 
                        onClick={() => {
                          setShowPresale(true);
                          playClickSound();
                        }}
                      >
                        Public Sale (0.25 SOL)
                      </Button>
                    </motion.div>
                    <motion.div 
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-1/2"
                    >
                      {isPasswordVerified ? (
                        <Button 
                          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-md hover:shadow-lg transition-all duration-200 animate-pulse-glow h-10" 
                          onClick={() => {
                            setShowPresale(true);
                            playClickSound();
                          }}
                        >
                          Private Sale (2.0 SOL)
                        </Button>
                      ) : (
                        <Button 
                          className="w-full border border-primary/50 text-primary font-medium bg-background/40 hover:bg-primary/10 shadow-sm h-10" 
                          onClick={() => {
                            setShowPasswordForm(true);
                            playClickSound();
                          }}
                        >
                          Unlock Private Sale
                        </Button>
                      )}
                    </motion.div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
        
        {showPresale && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.5 }}
            className="absolute bottom-8 left-0 right-0 mx-auto z-10 max-w-[500px] w-[calc(100%-2rem)]"
          >
            <div className="glass p-4 rounded-lg border-glow shadow-glow overflow-hidden">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-lg font-bold text-primary text-glow">Contribute to $POOKIE</h2>
                <motion.div 
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button 
                    className="h-7 px-2 text-xs" 
                    onClick={() => {
                      setShowPresale(false);
                      playClickSound();
                    }}
                  >
                    Back
                  </Button>
                </motion.div>
              </div>
              
              <div className="flex flex-col md:flex-row md:items-start gap-3">
                <div className="w-full md:w-2/5 mb-2 md:mb-0">
                  <div className="bg-background/30 rounded-lg p-3 backdrop-blur-sm">
                    <p className="text-sm text-foreground/90 mb-3">
                      {isPasswordVerified 
                        ? "You can contribute up to 2.0 SOL in the private sale."
                        : "Public sale contribution is fixed at 0.25 SOL."}
                    </p>
                    {!isPasswordVerified && (
                      <div className="mb-1">
                        <Button 
                          className="w-full border border-primary/50 text-primary font-medium bg-background/40 hover:bg-primary/10 shadow-sm h-10" 
                          onClick={() => {
                            setShowPresale(false);
                            setShowPasswordForm(true);
                            playClickSound();
                          }}
                        >
                          Know the secret phrase?
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="w-full md:w-3/5 bg-background/50 rounded-lg border border-primary/20">
                  <ContributionForm 
                    maxContribution={isPasswordVerified ? 2.0 : 0.25} 
                    tier={isPasswordVerified ? "core" : "public"} 
                    onClose={() => {
                      setShowPresale(false);
                      playClickSound();
                    }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

