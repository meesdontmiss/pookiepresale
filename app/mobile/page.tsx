'use client'

import { Suspense } from 'react'
import { useState, useEffect } from "react"
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import { TwitterIcon, MessageCircleIcon } from 'lucide-react'
import PreSaleForm from '@/components/presale/presale-form'
import PresaleStats from '@/components/presale/presale-stats'
import { useToast } from "@/components/ui/use-toast" 
import { playSound } from "@/hooks/use-audio"

// Dynamically import the 3D model component with no SSR
const PookieModel = dynamic(
  () => import('@/components/pookie-model-mobile'),
  { ssr: false }
)

interface Notification {
  id: number
  amount: number
  wallet: string
  timestamp: number
}

export default function MobilePage() {
  const [mounted, setMounted] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const { toast } = useToast()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Add notification system for mobile
  useEffect(() => {
    if (!mounted) return
    
    // Initialize Supabase client for real-time updates
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase credentials not available')
      return
    }
    
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Subscribe to new confirmed contributions
    const subscription = supabase
      .channel('public:contributions')
      .on('INSERT', (payload: any) => {
        const newContribution = payload.new
        
        if (newContribution && newContribution.status === 'confirmed') {
          // Show toast notification
          showContributionToast(
            formatWalletAddress(newContribution.wallet_address),
            newContribution.amount
          )
          
          // Play notification sound
          playSound('/sounds/notification.wav')
        }
      })
      .subscribe()
    
    // Listen for custom contribution notifications
    const handleDirectContribution = (event: CustomEvent) => {
      if (event.detail) {
        console.log('Mobile: Direct contribution notification received:', event.detail)
        
        // Show toast notification immediately
        showContributionToast(
          event.detail.wallet,
          event.detail.amount
        )
        
        // Play notification sound for immediate feedback
        playSound('/sounds/notification.wav')
      }
    }
    
    // Add event listener for direct contributions
    window.addEventListener('pookie-new-contribution', handleDirectContribution as EventListener)
    
    // Cleanup function
    return () => {
      subscription.unsubscribe()
      window.removeEventListener('pookie-new-contribution', handleDirectContribution as EventListener)
    }
  }, [mounted])
  
  // Format wallet address for display
  const formatWalletAddress = (address: string): string => {
    if (!address) return ''
    return `${address.substring(0, 4)}...${address.substring(address.length - 4)}`
  }
  
  // Function to show toast notification for contributions
  const showContributionToast = (wallet: string, amount: number) => {
    toast({
      title: "New Contribution",
      description: (
        <div className="flex flex-col">
          <span className="font-bold">{wallet}</span>
          <span>just contributed {amount} SOL</span>
        </div>
      ),
      duration: 5000,
    })
  }

  return (
    <div className="flex flex-col items-center w-full px-4 py-6 pb-24">
      {/* Header */}
      <header className="w-full flex justify-between items-center mb-6 sticky top-0 z-10 bg-gradient-to-b from-black to-transparent py-2">
        <div className="flex items-center">
          <img 
            src="/images/pookie-smashin.gif" 
            alt="Pookie Logo" 
            className="h-10 w-10 mr-2" 
          />
          <h1 className="text-2xl font-bold text-green-400 text-glow">$POOKIE</h1>
        </div>
        <div className="flex items-center gap-2">
          <WalletMultiButton className="bg-green-500 text-white rounded-md px-3 py-1 h-8 text-xs" />
          <Link 
            href="/"
            className="text-sm text-green-400 underline"
          >
            Desktop
          </Link>
        </div>
      </header>

      {/* 3D Model Container - Improved height and positioning */}
      <div className="relative w-full model-container mb-6">
        <Suspense fallback={<div className="w-full h-full flex items-center justify-center">Loading Pookie...</div>}>
          <PookieModel />
        </Suspense>
      </div>

      {/* Presale Box */}
      <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-sm rounded-xl p-5 mb-6 border-glow shadow-glow">
        <h2 className="text-xl font-bold text-center mb-3 text-green-400 text-glow">POOKIE Presale</h2>
        <PreSaleForm />
      </div>

      {/* Stats */}
      <div className="w-full max-w-md bg-zinc-900/80 backdrop-blur-sm rounded-xl p-5 mb-6 border-glow shadow-glow">
        <h2 className="text-xl font-bold text-center mb-3 text-glow">Presale Stats</h2>
        <PresaleStats />
      </div>

      {/* Social Links */}
      <div className="flex space-x-4 mb-6">
        <a 
          href="https://X.com/pookiethepeng" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-green-400 hover:bg-zinc-700 hover:text-green-300"
        >
          <TwitterIcon size={20} />
        </a>
        <a 
          href="https://t.me/pookiethepeng" 
          target="_blank" 
          rel="noopener noreferrer" 
          className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-green-400 hover:bg-zinc-700 hover:text-green-300"
        >
          <MessageCircleIcon size={20} />
        </a>
      </div>

      {/* Footer */}
      <footer className="w-full text-center text-xs text-gray-500 py-4 mt-auto">
        <div className="py-2">
          &copy; {new Date().getFullYear()} $POOKIE. All rights reserved.
        </div>
      </footer>
    </div>
  )
} 