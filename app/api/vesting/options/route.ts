import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabase-client';

export async function GET() {
  try {
    // Fetch active vesting options from the database
    const { data, error } = await supabase
      .from('vesting_options')
      .select('*')
      .eq('is_active', true)
      .order('days', { ascending: true });

    if (error) {
      console.error('Error fetching vesting options:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 