import { NextResponse } from 'next/server'
import { supabase } from '@/utils/supabase-client'

export async function POST(request: Request) {
  try {
    const { walletAddress, nftMint, stakingType } = await request.json()
    
    // Validate input parameters
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }
    
    // NFT unstaking
    if (stakingType === 'nft') {
      if (!nftMint) {
        return NextResponse.json(
          { error: 'NFT mint address is required' },
          { status: 400 }
        )
      }
      
      // Calculate the rewards before removing the staking record
      const { data: stakingData, error: fetchError } = await supabase
        .from('nft_staking_records')
        .select('*')
        .eq('wallet_address', walletAddress)
        .eq('mint', nftMint)
        .single();
      
      if (fetchError) {
        console.error('Error fetching NFT staking record:', fetchError);
        return NextResponse.json(
          { error: 'Failed to fetch staking record' },
          { status: 500 }
        );
      }
      
      if (!stakingData) {
        return NextResponse.json(
          { error: 'NFT is not staked by this wallet' },
          { status: 400 }
        );
      }
      
      // Calculate staking duration in days
      const stakedAt = new Date(stakingData.staked_at);
      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - stakedAt.getTime()) / (1000 * 60 * 60 * 24));
      
      // Calculate rewards (250 tokens per day)
      const rewardPerDay = 250;
      const totalReward = daysDiff * rewardPerDay;
      
      // Delete the staking record
      const { error: deleteError } = await supabase
        .from('nft_staking_records')
        .delete()
        .eq('wallet_address', walletAddress)
        .eq('mint', nftMint);
      
      if (deleteError) {
        console.error('Error removing NFT staking record:', deleteError);
        return NextResponse.json(
          { error: 'Failed to unstake NFT' },
          { status: 500 }
        );
      }
      
      // Record the reward claim
      if (totalReward > 0) {
        const { error: claimError } = await supabase
          .from('nft_staking_claims')
          .insert({
            wallet_address: walletAddress,
            amount: totalReward,
            status: 'completed'
          });
        
        if (claimError) {
          console.error('Error recording reward claim:', claimError);
          // Continue anyway, as the NFT is already unstaked
        }
      }
      
      return NextResponse.json({
        success: true,
        data: {
          walletAddress,
          nftMint,
          daysStaked: daysDiff,
          reward: totalReward
        }
      });
    }
    
    // Token unstaking would go here
    
    return NextResponse.json(
      { error: 'Unsupported staking type' },
      { status: 400 }
    )
    
  } catch (error) {
    console.error('Error in unstaking endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 