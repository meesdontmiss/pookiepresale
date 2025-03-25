import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/utils/supabase-client'

// Constants for presale
const PRESALE_CAP = process.env.NEXT_PUBLIC_PRESALE_CAP ? 
  parseFloat(process.env.NEXT_PUBLIC_PRESALE_CAP) : 75;

export async function GET(request: NextRequest) {
  try {
    console.log("API: Fetching presale stats...");
    
    // Provide default values for stats in case of database errors
    let totalRaised = 0;
    let contributorsCount = 0;
    
    try {
      // Get confirmed contributions
      const { data: contributions, error: contributionsError } = await supabase
        .from('contributions')
        .select('amount')
        .eq('status', 'confirmed')
      
      if (contributionsError) {
        console.error('Error fetching contributions:', contributionsError);
        // Continue with defaults
      } else if (contributions) {
        // Calculate total raised
        totalRaised = contributions.reduce((sum, contribution) => {
          return sum + (parseFloat(contribution.amount) || 0)
        }, 0);
      }
    } catch (contributionsError) {
      console.error('Exception fetching contributions:', contributionsError);
      // Continue with defaults
    }
    
    try {
      // Get unique contributors count
      const { count, error: countError } = await supabase
        .from('contributions')
        .select('wallet_address', { count: 'exact' })
        .eq('status', 'confirmed')
        .limit(1)
      
      if (countError) {
        console.error('Error counting contributors:', countError);
        // Continue with defaults
      } else if (typeof count === 'number') {
        contributorsCount = count;
      }
    } catch (countError) {
      console.error('Exception counting contributors:', countError);
      // Continue with defaults
    }
    
    console.log(`API: Stats retrieved - Raised: ${totalRaised}, Contributors: ${contributorsCount}`);
    
    // Return the presale statistics, with fallbacks to default values
    return NextResponse.json({
      success: true,
      stats: {
        total_raised: totalRaised.toFixed(2),
        contributors: contributorsCount,
        cap: PRESALE_CAP
      }
    })
    
  } catch (error) {
    console.error('Error processing presale stats request:', error);
    
    // Return a more graceful failure with default values
    return NextResponse.json({
      success: true,
      stats: {
        total_raised: "0.00",
        contributors: 0,
        cap: PRESALE_CAP
      },
      error_message: "Error fetching live stats. Showing default values."
    })
  }
} 