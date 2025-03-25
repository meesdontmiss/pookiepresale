import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase-client';
// Import the token balance function - commented out until token contract is available
// import { getTokenBalance } from '@/utils/token-client';
import { calculateTokens } from '@/utils/token-supply';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: 'Wallet address is required' },
        { status: 400 }
      );
    }

    // Get distribution record for the wallet
    const { data: distributionRecord, error: distError } = await supabase
      .from('distribution_records')
      .select('*')
      .eq('wallet_address', walletAddress)
      .maybeSingle();

    if (distError) {
      console.error('Error fetching distribution record:', distError);
      return NextResponse.json(
        { success: false, error: distError.message },
        { status: 500 }
      );
    }

    // If no distribution record found, return early
    if (!distributionRecord) {
      return NextResponse.json({
        success: true,
        message: 'No vested tokens found for this wallet',
        data: {
          distributionRecord: null,
          claimableTokens: [],
          // Will be populated when token contract is available
          currentTokenBalance: 0
        }
      });
    }

    // Get contributions with vesting for this wallet
    const { data: contributions, error: contribError } = await supabase
      .from('contributions')
      .select('*')
      .eq('wallet_address', walletAddress)
      // Only include contributions with vesting periods
      .not('vesting_end_date', 'is', null);

    if (contribError) {
      console.error('Error fetching contributions:', contribError);
      return NextResponse.json(
        { success: false, error: contribError.message },
        { status: 500 }
      );
    }

    // Process contributions to determine claimable tokens
    const now = new Date();
    const claimableTokens = contributions
      .filter(contrib => {
        // Check if vesting period has ended
        const vestingEndDate = new Date(contrib.vesting_end_date);
        return vestingEndDate <= now;
      })
      .map(contrib => {
        // Calculate token amounts using utility function
        const { baseTokens, bonusTokens, totalTokens } = calculateTokens(
          contrib.amount, 
          contrib.vesting_bonus_percentage
        );

        return {
          id: contrib.id,
          amount: contrib.amount,
          vestingEndDate: contrib.vesting_end_date,
          bonus: contrib.vesting_bonus_percentage,
          baseTokens,
          bonusTokens,
          totalTokens
        };
      });

    // Get the current token balance - disabled until token contract is available
    let currentTokenBalance = 0;
    /* 
    // Uncomment when token contract is available
    try {
      currentTokenBalance = await getTokenBalance(walletAddress);
    } catch (error) {
      console.error('Error fetching token balance:', error);
      // Just log the error but continue with the response
    }
    */
    
    return NextResponse.json({
      success: true,
      data: {
        distributionRecord,
        claimableTokens,
        currentTokenBalance
      }
    });
    
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 