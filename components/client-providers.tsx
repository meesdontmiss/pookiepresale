"use client"

import React from 'react'
import { WalletProvider } from '@/components/wallet-provider'
import { GlobalSoundProvider } from '@/components/global-sound-provider'
import { BodyClassManager } from "@/components/layout/body-class-manager"

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <BodyClassManager />
      <GlobalSoundProvider />
      {children}
    </WalletProvider>
  )
} 