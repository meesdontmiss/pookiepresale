"use client"

import { useMemo } from "react"
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from "@solana/wallet-adapter-react"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets"
import { Commitment } from "@solana/web3.js"

// Import the wallet adapter styles
import "@solana/wallet-adapter-react-ui/styles.css"

export function WalletProviderCore({ children }: { children: React.ReactNode }) {
  // RELIABLE RPC ENDPOINTS FOR BROWSER CLIENTS - using public/free endpoints known to work
  const BROWSER_RPC_ENDPOINT = "https://solana-mainnet.g.alchemy.com/v2/demo";

  // Use a simple endpoint configuration to avoid any issues
  const endpoint = useMemo(() => {
    return BROWSER_RPC_ENDPOINT;
  }, []);

  // Create list of supported wallets
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  )
} 