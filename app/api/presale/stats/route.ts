import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/utils/supabase-client'

// Constants for presale
const PRESALE_CAP = process.env.NEXT_PUBLIC_PRESALE_CAP ? 
  parseFloat(process.env.NEXT_PUBLIC_PRESALE_CAP) : 75;

export async function GET(request: NextRequest) {
  try {
    // Get confirmed contributions
    const { data: contributions, error: contributionsError } = await supabase
      .from('contributions')
      .select('amount')
      .eq('status', 'confirmed')
    
    if (contributionsError) {
      console.error('Error fetching contributions:', contributionsError)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch presale statistics' 
      }, { status: 500 })
    }
    
    // Calculate total raised
    const totalRaised = contributions.reduce((sum, contribution) => {
      return sum + (parseFloat(contribution.amount) || 0)
    }, 0)
    
    // Get unique contributors count
    const { count: contributorsCount, error: countError } = await supabase
      .from('contributions')
      .select('wallet_address', { count: 'exact' })
      .eq('status', 'confirmed')
      .limit(1)
    
    if (countError) {
      console.error('Error counting contributors:', countError)
      // Continue despite this error, just default to 0
    }
    
    // Return the presale statistics
    return NextResponse.json({
      success: true,
      stats: {
        total_raised: totalRaised.toFixed(2),
        contributors: contributorsCount || 0,
        cap: PRESALE_CAP
      }
    })
    
  } catch (error) {
    console.error('Error processing presale stats request:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
} 