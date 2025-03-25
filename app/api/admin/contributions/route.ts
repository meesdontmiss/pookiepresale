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

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const status = searchParams.get('status') || 'confirmed'
    
    // Get contributions
    const { data, error, count } = await supabase
      .from('contributions')
      .select('*', { count: 'exact' })
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    return NextResponse.json({
      success: true,
      data,
      pagination: {
        total: count,
        limit,
        offset
      }
    })
  } catch (error) {
    console.error('Admin contributions error:', error)
    return NextResponse.json({ error: 'Failed to fetch contributions' }, { status: 500 })
  }
} 