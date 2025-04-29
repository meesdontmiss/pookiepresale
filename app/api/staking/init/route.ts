import { NextResponse } from 'next/server'
import { checkNFTStakingTables, createNFTStakingTables } from '@/utils/check-staking-tables'

export async function GET(request: Request) {
  try {
    // Check if tables exist
    const { tablesExist, missingTables } = await checkNFTStakingTables()
    
    // If tables exist, return success
    if (tablesExist) {
      return NextResponse.json({
        success: true,
        message: 'NFT staking tables already exist',
        tablesExist,
        missingTables: []
      })
    }
    
    // Create tables if they don't exist
    const result = await createNFTStakingTables()
    
    return NextResponse.json({
      success: result.success,
      message: result.message,
      tablesExist: result.success,
      missingTables: result.success ? [] : missingTables
    })
    
  } catch (error) {
    console.error('Error in NFT staking initialization endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    )
  }
} 