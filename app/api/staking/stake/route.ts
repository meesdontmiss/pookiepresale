import { NextResponse } from 'next/server'
import { supabase } from '@/utils/supabase-client'

export async function POST(request: Request) {
  try {
    const { walletAddress, amount, vestingDays } = await request.json()
    
    // Validate input parameters
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address is required' },
        { status: 400 }
      )
    }
    
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      )
    }
    
    if (!vestingDays || vestingDays < 1) {
      return NextResponse.json(
        { error: 'Vesting days must be at least 1' },
        { status: 400 }
      )
    }
    
    // Calculate vesting end date
    const vestingEndDate = new Date()
    vestingEndDate.setDate(vestingEndDate.getDate() + vestingDays)
    
    // Insert staking record in the database
    const { data, error } = await supabase.rpc('process_staking', {
      p_wallet_address: walletAddress,
      p_amount: amount,
      p_vesting_days: vestingDays,
      p_vesting_end_date: vestingEndDate.toISOString()
    })
    
    if (error) {
      console.error('Error processing staking:', error)
      return NextResponse.json(
        { error: 'Failed to process staking request' },
        { status: 500 }
      )
    }
    
    // Calculate bonus percentage based on vesting days
    let bonusPercentage = 5 // Default 5%
    if (vestingDays >= 365) bonusPercentage = 50
    else if (vestingDays >= 180) bonusPercentage = 30
    else if (vestingDays >= 90) bonusPercentage = 20
    else if (vestingDays >= 30) bonusPercentage = 10
    
    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        walletAddress,
        amount,
        vestingDays,
        vestingEndDate: vestingEndDate.toISOString(),
        bonusPercentage
      }
    })
    
  } catch (error) {
    console.error('Error in staking endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 