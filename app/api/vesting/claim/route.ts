import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase-client';
import { calculateTokens } from '@/utils/token-supply';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, contributionId } = body;

    if (!walletAddress || !contributionId) {
      return NextResponse.json(
        { success: false, error: 'Wallet address and contribution ID are required' },
        { status: 400 }
      );
    }

    // Verify the contribution exists, belongs to the wallet, and is past vesting end date
    const { data: contribution, error: fetchError } = await supabase
      .from('contributions')
      .select('*')
      .eq('id', contributionId)
      .eq('wallet_address', walletAddress)
      .single();

    if (fetchError) {
      console.error('Error fetching contribution:', fetchError);
      return NextResponse.json(
        { success: false, error: fetchError.message },
        { status: 500 }
      );
    }

    if (!contribution) {
      return NextResponse.json(
        { success: false, error: 'Contribution not found or does not belong to this wallet' },
        { status: 404 }
      );
    }

    // Check if vesting period has ended
    if (!contribution.vesting_end_date) {
      return NextResponse.json(
        { success: false, error: 'This contribution has no vesting period' },
        { status: 400 }
      );
    }

    const now = new Date();
    const vestingEndDate = new Date(contribution.vesting_end_date);
    
    if (vestingEndDate > now) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Vesting period has not ended yet',
          vestingEndDate: vestingEndDate.toISOString(),
          currentDate: now.toISOString(),
          remainingDays: Math.ceil((vestingEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        },
        { status: 400 }
      );
    }

    // In a production environment, this is where you would:
    // 1. Execute the actual token transfer transaction on the blockchain
    // 2. Update the database to mark the tokens as claimed
    
    /* 
    // UNCOMMENT AND COMPLETE THIS CODE WHEN TOKEN CONTRACT IS AVAILABLE
    
    // Token contract address
    const TOKEN_CONTRACT = process.env.POOKIE_TOKEN_CONTRACT;
    
    // Create a connection to Solana
    const connection = new Connection(process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
    
    // Get admin keypair from environment (securely manage this in production)
    const adminPrivateKey = new Uint8Array(JSON.parse(process.env.ADMIN_PRIVATE_KEY || '[]'));
    const adminKeypair = Keypair.fromSecretKey(adminPrivateKey);
    
    // Create a token object
    const tokenPublicKey = new PublicKey(TOKEN_CONTRACT);
    
    // Get the associated token account for the user's wallet
    const recipientTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      adminKeypair,
      tokenPublicKey,
      new PublicKey(walletAddress)
    );
    
    // Calculate token amounts using utility function
    const { totalTokens } = calculateTokens(
      contribution.amount, 
      contribution.vesting_bonus_percentage
    );
    
    // Amount to transfer (with decimals)
    const TOKEN_DECIMALS = parseInt(process.env.NEXT_PUBLIC_TOKEN_DECIMALS || '9');
    const transferAmount = totalTokens * (10 ** TOKEN_DECIMALS);
    
    // Create and send the token transfer transaction
    const transferTx = await transfer(
      connection,
      adminKeypair,
      adminKeypair.publicKey,
      recipientTokenAccount.address,
      transferAmount
    );
    
    console.log(`Token transfer completed: ${transferTx}`);
    */
    
    // For now, we're just simulating the claim by updating a fictional 'claimed' status
    const { error: updateError } = await supabase
      .from('contributions')
      .update({ 
        // This is a placeholder - in production you would have a proper 'claimed' column
        // and possibly store the claim transaction ID
        updated_at: new Date().toISOString()
      })
      .eq('id', contributionId);

    if (updateError) {
      console.error('Error updating contribution:', updateError);
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    // Calculate tokens based on contribution amount and bonus percentage
    const { baseTokens, bonusTokens, totalTokens } = calculateTokens(
      contribution.amount, 
      contribution.vesting_bonus_percentage
    );

    return NextResponse.json({
      success: true,
      message: 'Tokens claimed successfully',
      data: {
        contributionAmount: contribution.amount,
        vestingBonusPercentage: contribution.vesting_bonus_percentage,
        baseTokens,
        bonusTokens,
        totalTokens
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