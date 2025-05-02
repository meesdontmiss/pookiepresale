"use client" // ADD: Needs to be client component for hook

import type { Metadata } from "next"
import { usePathname } from 'next/navigation' // ADD: Import hook
import { WalletProvider } from '@/components/wallet-provider'
import { GlobalSoundProvider } from '@/components/global-sound-provider'
import { BodyClassManager } from "@/components/layout/body-class-manager"
// import "@/lib/rpc-patch"
import "./globals.css"
import { cn } from "@/lib/utils"; // ADD: For conditional classes

// NOTE: Metadata export might cause issues in Client Components.
// Consider moving metadata to page.tsx files if this becomes a problem.
// For now, let's see if it works.
// export const metadata: Metadata = { ... }; // Keep existing metadata for now

export const metadata: Metadata = {
  title: "$POOKIE",
  description: "Pookie - Damn Pookie?! How u waddle like dat?",
  keywords: ["Pookie", "PookieMafia", "memecoin", "cryptocurrency", "Solana", "SOL", "presale"],
  authors: [{ name: "PookieMafia" }],
  creator: "PookieMafia",
  publisher: "PookieMafia",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://plugpenguin.com"),
  // Open Graph metadata
  openGraph: {
    type: "website",
    locale: "en_US",
    url: process.env.NEXT_PUBLIC_SITE_URL || "https://plugpenguin.com",
    title: "$POOKIE - The Memecoin Revolution",
    description: "Pookie - Damn Pookie?! How u waddle like dat?",
    siteName: "$POOKIE",
    images: [
      {
        url: "/images/GARY-PACK.png",
        width: 1200,
        height: 630,
        alt: "Pookie Social Share Image",
      },
    ],
  },
  // Twitter metadata
  twitter: {
    card: "summary_large_image",
    title: "$POOKIE",
    description: "Pookie - Damn Pookie?! How u waddle like dat?",
    images: ["/images/GARY-PACK.png"],
    creator: "@PookieThePeng",
  },
  // Other metadata
  robots: {
    index: true,
    follow: true,
  },
  themeColor: "#00ff88",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // ADD hook logic
  const pathname = usePathname(); 
  const isStakingPage = pathname === '/staking';

  // Determine cursor class based on path
  const cursorClass = isStakingPage ? 'cursor-default' : 'cursor-middle-finger';

  return (
    // Apply conditional class
    <html lang="en" className={cn(cursorClass)}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        
        {/* Favicons */}
        <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png" />
        <link rel="manifest" href="/favicon/site.webmanifest" />
        <link rel="mask-icon" href="/favicon/safari-pinned-tab.svg" color="#00ff88" />
        <link rel="shortcut icon" href="/favicon/favicon.ico" />
        <meta name="msapplication-TileColor" content="#00ff88" />
        <meta name="msapplication-config" content="/favicon/browserconfig.xml" />
        
        {/* Telegram specific */}
        <meta property="telegram:channel" content="@Pookiethepeng" />
        
        {/* Additional Twitter metadata for better cards */}
        <meta name="twitter:site" content="@Pookiethepeng" />
        <meta name="twitter:image:alt" content="Pookie Memecoin" />
      </head>
      {/* Apply conditional class */}
      <body className={cn("min-h-screen bg-background antialiased", cursorClass)}>
        <WalletProvider>
          <BodyClassManager />
          <GlobalSoundProvider />
          {children}
        </WalletProvider>
      </body>
    </html>
  )
}