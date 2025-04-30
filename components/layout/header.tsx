"use client"

import { useState, useEffect } from "react"
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui"
import Link from "next/link"
import { useWallet } from "@solana/wallet-adapter-react"
import { playClickSound } from "@/hooks/use-audio"

export function Header() {
  const { connected } = useWallet()
  const [mounted, setMounted] = useState(false)

  // Set mounted to prevent hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  // Only render the Wallet button on the client to avoid hydration issues
  if (!mounted) return null

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between p-4 bg-background/70 backdrop-blur-md">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-xl font-bold text-primary hover:text-primary/80 transition-colors">
          $POOKIE
        </Link>
        
        <nav className="hidden md:flex items-center space-x-4">
          <Link href="/" className="text-foreground hover:text-primary transition-colors">
            Home
          </Link>
          <Link href="/staking" className="text-foreground hover:text-primary transition-colors">
            Staking
          </Link>
        </nav>
      </div>
      
      <div className="flex items-center gap-4">
        {/* PRIMARY WALLET BUTTON - This is the main one we'll keep */}
        <WalletMultiButton className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-3 py-1 h-8" />
      </div>
    </header>
  )
} 