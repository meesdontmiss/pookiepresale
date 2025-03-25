"use client"

import { useState, useEffect } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { Connection, PublicKey } from '@solana/web3.js'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'
import { playSound } from '@/hooks/use-audio'
import { supabase } from '@/utils/supabase-client'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { Skeleton } from '@/components/ui/skeleton'

// Sound path
const CLICK_SOUND_PATH = '/sounds/click-sound.wav'
const SUCCESS_SOUND_PATH = '/sounds/success-sound.wav'

// Solana RPC URL
const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com"

// Mock NFT data - in production this would come from on-chain
const MOCK_NFTS = [
  {
    mint: 'NFT1234567890',
    name: 'Pookie Mafia #1',
    image: '/images/pookie-smashin.gif',
    stakedDays: 0,
    isStaked: false,
    dailyReward: 10
  },
  {
    mint: 'NFT2345678901',
    name: 'Pookie Mafia #2',
    image: '/images/pookie-smashin.gif',
    stakedDays: 0,
    isStaked: false,
    dailyReward: 10
  }
]

interface NFT {
  mint: string
  name: string
  image: string
  stakedDays: number
  isStaked: boolean
  dailyReward: number
}

export default function NftStaking() {
  const { connected, publicKey } = useWallet()
  const [userNfts, setUserNfts] = useState<NFT[]>([])
  const [stakedNfts, setStakedNfts] = useState<NFT[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [totalRewards, setTotalRewards] = useState<number>(0)

  return (
    <div className="space-y-6 py-2">
      <div className="flex flex-col items-center justify-center p-8 border border-primary/20 rounded-lg bg-background/30 backdrop-blur-sm">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", duration: 0.5 }}
          className="flex flex-col items-center text-center"
        >
          <Image 
            src="/images/pookie-smashin.gif" 
            alt="Coming Soon" 
            width={150} 
            height={150} 
            className="mb-4 rounded-lg"
          />
          <h2 className="text-2xl font-bold text-primary text-glow mb-2">NFT Staking Coming Soon</h2>
          <p className="text-muted-foreground max-w-md mb-6">
            Our NFT staking feature is currently under development. Stay tuned for the launch where you'll be able to stake your Pookie NFTs and earn rewards!
          </p>
          <Button 
            disabled
            variant="outline" 
            size="lg" 
            className="animate-pulse border-primary/50 bg-primary/10 text-primary font-semibold px-8"
          >
            Coming Soon
          </Button>
        </motion.div>
      </div>
    </div>
  )
} 