"use client"

import { useMemo } from "react"
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from "@solana/wallet-adapter-react"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets"
import { clusterApiUrl, Commitment } from "@solana/web3.js"

// Import the wallet adapter styles
import "@solana/wallet-adapter-react-ui/styles.css"

export function WalletProviderCore({ children }: { children: React.ReactNode }) {
  // Use our API proxy to avoid 403 errors
  const endpoint = useMemo(() => {
    // In production use our API proxy to avoid 403 errors
    if (typeof window !== 'undefined') {
      // Must use absolute URL for client-side
      const baseUrl = window.location.origin;
      return `${baseUrl}/api/rpc/proxy`;
    }
    // Fallback for SSR
    return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl("mainnet-beta");
  }, []);

  // Create list of supported wallets
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  )
} 