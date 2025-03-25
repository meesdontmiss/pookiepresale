"use client"

import type React from "react"

import { useMemo, useState, useEffect } from "react"
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base"
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from "@solana/wallet-adapter-react"
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui"
import { PhantomWalletAdapter, SolflareWalletAdapter } from "@solana/wallet-adapter-wallets"
import { clusterApiUrl, Connection, Commitment } from "@solana/web3.js"

// Import the wallet adapter styles
import "@solana/wallet-adapter-react-ui/styles.css"

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)

  // Use effect to set mounted state
  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // Use multiple fallback RPC endpoints to avoid 403 errors
  const rpcEndpoints = [
    "https://rpc.helius.xyz/?api-key=28cda6d9-5527-4c12-a0b3-cf2c6e54c1a4", // Helius RPC
    "https://solana-mainnet.phantom.app/YBPpkkN4g91xDiAnTE9r0RcMkjg0sKUIWvAfoFVJ", // Phantom endpoint
    "https://solana-api.syndica.io/access-token/9iDftHLv5zEEVAoZt8PVTCx369RxJ845xdMu9UGevAGg9YdwzaiJpBzZGrL9vt3N/rpc", // Syndica endpoint
    "https://boldest-empty-bridge.solana-mainnet.quiknode.pro/4d8d5aa933a5aee3c9e72cf7119e279026eb4f11/", // QuickNode
    clusterApiUrl("mainnet-beta"), // Fallback to standard Solana endpoint
  ];

  // You can also provide a custom onError function to monitor for RPC connection errors
  const onConnectionError = (error: any) => {
    console.error("Solana connection error:", error);
  };

  // Use a more reliable endpoint setup with fallback configuration
  const endpoint = useMemo(() => {
    // Use the first endpoint as default
    return {
      endpoint: rpcEndpoints[0],
      config: {
        confirmTransactionInitialTimeout: 60000, // 60 seconds
        commitment: 'confirmed' as Commitment,
        disableRetryOnRateLimit: false,
        httpHeaders: {
          'Content-Type': 'application/json',
        }
      }
    };
  }, []);

  // Create list of supported wallets
  const wallets = useMemo(() => [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
  ], []);

  // Return children directly if still on server
  if (!mounted) {
    return <>{children}</>
  }

  return (
    <ConnectionProvider endpoint={endpoint.endpoint} config={endpoint.config}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  )
}

