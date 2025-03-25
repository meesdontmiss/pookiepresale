import { NextRequest, NextResponse } from 'next/server'
import { PublicKey, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { supabase } from '@/utils/supabase-client'

// Configure Solana connection
const SOLANA_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
const TREASURY_WALLET = process.env.NEXT_PUBLIC_TREASURY_WALLET || ''

// Create Solana connection with improved configuration
const connection = new Connection(SOLANA_RPC_URL, {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000 // 60 seconds timeout
})

export async function POST(request: NextRequest) {
  try {
    // Get transaction data from request
    const body = await request.json()
    const { signature, walletAddress, amount, tier = 'public' } = body
    
    // Validate inputs
    if (!signature) {
      return NextResponse.json({ error: 'Transaction signature is required' }, { status: 400 })
    }
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }
    
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 })
    }
    
    // Check if transaction already exists in database
    const { data: existingTransaction } = await supabase
      .from('contributions')
      .select('id')
      .eq('transaction_id', signature)
      .limit(1)
    
    if (existingTransaction && existingTransaction.length > 0) {
      return NextResponse.json({ success: true, message: 'Transaction already recorded' })
    }
    
    // Verify transaction on Solana
    try {
      const transactionDetails = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      })
      
      if (!transactionDetails) {
        return NextResponse.json({ error: 'Transaction not found on Solana' }, { status: 400 })
      }
      
      if (!transactionDetails.meta) {
        return NextResponse.json({ error: 'Invalid transaction metadata' }, { status: 400 })
      }
      
      // Simplified verification approach:
      // 1. Verify transaction was confirmed
      if (transactionDetails.meta.err) {
        return NextResponse.json({ 
          error: 'Transaction failed on Solana',
          details: transactionDetails.meta.err
        }, { status: 400 })
      }
      
      // 2. Extract treasury wallet balance change
      const treasuryKey = new PublicKey(TREASURY_WALLET)
      let treasuryBalanceChange = 0
      
      // Iterate through the balance changes to find the treasury wallet
      const preBalances = transactionDetails.meta.preBalances
      const postBalances = transactionDetails.meta.postBalances
      
      // Create a list of account addresses involved in the transaction
      let accountAddresses: string[] = []
      
      try {
        // For legacy transactions (most common)
        if ('accountKeys' in transactionDetails.transaction.message) {
          // For legacy transactions
          const message = transactionDetails.transaction.message as { accountKeys: { toString(): string }[] }
          accountAddresses = message.accountKeys.map(key => key.toString())
        }
        // For versioned transactions
        else if (typeof transactionDetails.transaction.message.getAccountKeys === 'function') {
          const keySet = transactionDetails.transaction.message.getAccountKeys()
          if (keySet) {
            // Get all account keys involved
            accountAddresses = keySet.keySegments().flat().map((key: { toString(): string }) => key.toString())
          }
        }
      } catch (error) {
        console.error('Error extracting account addresses:', error)
      }
      
      // Find treasury wallet in the transaction
      const treasuryAddress = treasuryKey.toString()
      const treasuryIndex = accountAddresses.findIndex(addr => addr === treasuryAddress)
      
      if (treasuryIndex === -1) {
        return NextResponse.json({ error: 'Transaction does not involve the treasury wallet' }, { status: 400 })
      }
      
      // Calculate balance change
      treasuryBalanceChange = (postBalances[treasuryIndex] - preBalances[treasuryIndex]) / LAMPORTS_PER_SOL
      
      // Check if balance change matches expected amount (with small tolerance for rounding)
      if (Math.abs(treasuryBalanceChange - amount) > 0.001) {
        return NextResponse.json({
          error: `Amount mismatch. Expected ${amount} SOL, got ${treasuryBalanceChange} SOL`
        }, { status: 400 })
      }
      
      // 3. Verify sender address is in the transaction
      const senderAddress = walletAddress.toString()
      const senderIndex = accountAddresses.findIndex(addr => addr === senderAddress)
      
      if (senderIndex === -1) {
        return NextResponse.json({ error: 'Transaction does not involve the specified wallet' }, { status: 400 })
      }
      
      // Save transaction to database
      const { data, error } = await supabase
        .from('contributions')
        .insert([
          {
            wallet_address: walletAddress,
            amount: amount,
            transaction_id: signature,
            tier: tier,
            status: 'confirmed',
          }
        ])
        .select()
      
      if (error) {
        console.error('Database error:', error)
        return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 })
      }
      
      return NextResponse.json({
        success: true,
        message: 'Transaction verified and recorded successfully',
        transaction: data[0]
      })
      
    } catch (error) {
      console.error('Verification error:', error)
      return NextResponse.json({
        error: 'Failed to verify transaction on Solana',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 400 })
    }
    
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
} 