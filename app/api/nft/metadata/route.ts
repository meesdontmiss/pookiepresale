import { NextResponse } from 'next/server'
import { fetchNFTMetadata } from '@/utils/solana-nft'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const mint = searchParams.get('mint')
    
    if (!mint) {
      return NextResponse.json(
        { error: 'NFT mint address is required' },
        { status: 400 }
      )
    }
    
    // Fetch NFT metadata using our updated utility
    const metadata = await fetchNFTMetadata(mint)
    
    if (!metadata) {
      return NextResponse.json(
        { error: 'Failed to fetch NFT metadata' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data: metadata
    })
    
  } catch (error) {
    console.error('Error in NFT metadata endpoint:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
} 