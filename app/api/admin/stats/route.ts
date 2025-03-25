import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/utils/supabase-client'
import { verifyAdminAuth } from '@/utils/admin-auth'

export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const authResult = await verifyAdminAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get total SOL raised
    const { data: totalRaised, error: totalError } = await supabase
      .from('contributions')
      .select('amount')
      .eq('status', 'confirmed')

    if (totalError) throw totalError

    // Get total number of contributors (unique wallets)
    const { data: uniqueContributors, error: uniqueError } = await supabase
      .from('contributions')
      .select('wallet_address')
      .eq('status', 'confirmed')
      .limit(1000)

    if (uniqueError) throw uniqueError

    // Get latest contributions
    const { data: recentContributions, error: recentError } = await supabase
      .from('contributions')
      .select('*')
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(10)

    if (recentError) throw recentError

    // Calculate statistics
    const totalAmount = totalRaised.reduce((sum, record) => sum + record.amount, 0)
    const uniqueWallets = new Set(uniqueContributors.map(record => record.wallet_address)).size
    const averageContribution = uniqueWallets > 0 ? totalAmount / uniqueWallets : 0

    // Get tier breakdown
    const { data: tierBreakdown, error: tierError } = await supabase
      .from('contributions')
      .select('tier, amount')
      .eq('status', 'confirmed')

    if (tierError) throw tierError

    // Calculate tier totals
    const tiers = tierBreakdown.reduce((acc, record) => {
      const tier = record.tier || 'unknown'
      acc[tier] = (acc[tier] || 0) + record.amount
      return acc
    }, {} as Record<string, number>)

    return NextResponse.json({
      success: true,
      stats: {
        totalRaised: totalAmount,
        uniqueContributors: uniqueWallets,
        averageContribution,
        tiers,
        recentContributions
      }
    })
  } catch (error) {
    console.error('Admin stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch admin stats' }, { status: 500 })
  }
} 