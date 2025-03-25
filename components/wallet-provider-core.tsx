"use client"

import { useMemo, useEffect } from "react"
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from "@solana/wallet-adapter-react"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets"
import { createReliableConnection } from "@/lib/solana-connection-patch"

// Import the wallet adapter styles
import "@solana/wallet-adapter-react-ui/styles.css"

export function WalletProviderCore({ children }: { children: React.ReactNode }) {
  // Apply our connection patch when the component loads
  useEffect(() => {
    // Import the patch module to ensure it runs
    require('@/lib/solana-connection-patch');
    console.log("🔧 Solana connection patch applied");
  }, []);

  // Use our reliable connection creator
  const endpoint = useMemo(() => {
    console.log("Creating reliable Solana connection");
    return createReliableConnection();
  }, []);

  // Create list of supported wallets
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider connection={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  )
} 