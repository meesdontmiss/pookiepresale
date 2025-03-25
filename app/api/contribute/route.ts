import { type NextRequest, NextResponse } from "next/server"
import { supabase } from '@/utils/supabase-client'
import { calculateTokens } from '@/utils/token-supply'

// This would be stored in a database in a real application
const contributions: {
  wallet: string
  amount: number
  tier: string
  timestamp: number
}[] = []

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { walletAddress, amount, transactionId, vestingDays } = body

    // Basic validation
    if (!walletAddress || !amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Valid wallet address and positive amount are required' },
        { status: 400 }
      )
    }

    // Ensure amount is a multiple of 0.5 SOL
    if (amount % 0.5 !== 0) {
      return NextResponse.json(
        { success: false, error: 'Amount must be a multiple of 0.5 SOL' },
        { status: 400 }
      )
    }

    // Get vesting bonus percentage based on days
    const { data: vestingOption, error: vestingError } = await supabase
      .from('vesting_options')
      .select('bonus_percentage')
      .eq('days', vestingDays)
      .eq('is_active', true)
      .single()

    if (vestingError && vestingError.code !== 'PGRST116') {
      console.error('Error fetching vesting option:', vestingError)
      return NextResponse.json(
        { success: false, error: vestingError.message },
        { status: 500 }
      )
    }

    // Default to 0% bonus if no vesting option found
    const bonusPercentage = vestingOption?.bonus_percentage || 0

    // Calculate token allocation
    const { baseTokens, bonusTokens, totalTokens } = calculateTokens(amount, bonusPercentage)

    // Calculate vesting end date
    let vestingEndDate = null
    if (vestingDays > 0) {
      vestingEndDate = new Date()
      vestingEndDate.setDate(vestingEndDate.getDate() + vestingDays)
    }

    // Call the stored procedure to process the contribution with vesting
    const { data, error } = await supabase.rpc('process_contribution_with_vesting', {
      p_wallet_address: walletAddress,
      p_amount: amount,
      p_transaction_id: transactionId || 'pending',
      p_vesting_days: vestingDays,
      p_vesting_bonus_percentage: bonusPercentage,
      p_vesting_end_date: vestingEndDate ? vestingEndDate.toISOString() : null
    })

    if (error) {
      console.error('Error processing contribution:', error)
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Contribution recorded successfully',
      data: {
        contributionId: data.contribution_id,
        amount,
        walletAddress,
        vestingDays,
        bonusPercentage,
        baseTokens,
        bonusTokens,
        totalTokens,
        vestingEndDate: vestingEndDate ? vestingEndDate.toISOString() : null
      }
    })
  } catch (error) {
    console.error('Error processing request:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  // This endpoint would be used for analytics and admin purposes
  // In a real application, this would be protected with authentication

  const { searchParams } = new URL(request.url)
  const wallet = searchParams.get("wallet")

  if (wallet) {
    const walletContributions = contributions.filter((c) => c.wallet === wallet)
    return NextResponse.json({ contributions: walletContributions })
  }

  return NextResponse.json({ contributions })
}

