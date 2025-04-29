import { NextResponse } from 'next/server'
import { supabase } from '@/utils/supabase-client'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('wallet')
    
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }
    
    // Fetch staked NFTs for the wallet
    const { data, error } = await supabase
      .from('nft_staking_records')
      .select('*')
      .eq('wallet_address', walletAddress)
    
    if (error) {
      console.error('Error fetching staked NFTs:', error)
      return NextResponse.json(
        { error: 'Failed to fetch staked NFTs' },
        { status: 500 }
      )
    }
    
    // Calculate the current staking duration and rewards for each NFT
    const now = new Date()
    const stakedNfts = data.map(nft => {
      const stakedAt = new Date(nft.staked_at)
      const daysDiff = Math.floor((now.getTime() - stakedAt.getTime()) / (1000 * 60 * 60 * 24))
      const rewardPerDay = 250
      const currentReward = daysDiff * rewardPerDay
      
      return {
        id: nft.id,
        mint: nft.mint,
        stakedAt: nft.staked_at,
        daysStaked: daysDiff,
        currentReward
      }
    })
    
    return NextResponse.json({
      success: true,
      data: stakedNfts
    })
    
  } catch (error) {
    console.error('Error in staked NFTs endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 