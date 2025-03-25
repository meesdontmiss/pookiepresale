"use client"

import { useState, useEffect } from "react"
import dynamic from "next/dynamic"

// Create a client-only WalletProviderCore to prevent SSR errors
const WalletProviderCore = dynamic(
  () => import('./wallet-provider-core').then((mod) => mod.WalletProviderCore),
  { 
    ssr: false,
    loading: () => <>{/* Loading placeholder */}</> 
  }
)

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  // Set mounted state to ensure client-side rendering
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Only render the provider on the client to avoid hydration issues
  if (!mounted) {
    return <>{children}</>
  }

  return <WalletProviderCore>{children}</WalletProviderCore>
}

