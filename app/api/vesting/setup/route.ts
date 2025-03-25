import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/utils/supabase-client'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { walletAddress, days, contributionId, bonusPercentage } = body
    
    // Basic validation
    if (!walletAddress || !days || days <= 0 || !contributionId) {
      return NextResponse.json(
        { success: false, error: 'Valid wallet address, days, and contribution ID are required' },
        { status: 400 }
      )
    }
    
    // Calculate vesting end date
    const vestingEndDate = new Date()
    vestingEndDate.setDate(vestingEndDate.getDate() + days)
    
    // Create vesting record
    const { data, error } = await supabase
      .from('vesting_schedules')
      .insert([
        {
          wallet_address: walletAddress,
          contribution_id: contributionId,
          vesting_days: days,
          bonus_percentage: bonusPercentage || 0,
          vesting_end_date: vestingEndDate.toISOString(),
          is_claimed: false
        }
      ])
      .select()
    
    if (error) {
      console.error('Error creating vesting schedule:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: 'Vesting schedule created successfully',
      data: data[0]
    })
    
  } catch (error) {
    console.error('Error processing vesting setup request:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
} 