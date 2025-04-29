import { supabase } from './supabase-client'

/**
 * Check if the required NFT staking tables exist in the database
 */
export async function checkNFTStakingTables(): Promise<{
  tablesExist: boolean;
  missingTables: string[];
}> {
  try {
    // Check if nft_staking_records table exists
    const { data: recordsData, error: recordsError } = await supabase
      .from('nft_staking_records')
      .select('id')
      .limit(1)
      .maybeSingle();

    // Check if nft_staking_claims table exists
    const { data: claimsData, error: claimsError } = await supabase
      .from('nft_staking_claims')
      .select('id')
      .limit(1)
      .maybeSingle();

    const missingTables = [];
    
    if (recordsError && recordsError.code === '42P01') {
      // Error code 42P01 means "relation does not exist"
      missingTables.push('nft_staking_records');
    }
    
    if (claimsError && claimsError.code === '42P01') {
      missingTables.push('nft_staking_claims');
    }

    return {
      tablesExist: missingTables.length === 0,
      missingTables
    };
  } catch (error) {
    console.error('Error checking NFT staking tables:', error);
    return {
      tablesExist: false,
      missingTables: ['nft_staking_records', 'nft_staking_claims']
    };
  }
}

/**
 * Create NFT staking tables if they don't exist
 */
export async function createNFTStakingTables(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const { tablesExist, missingTables } = await checkNFTStakingTables();
    
    if (tablesExist) {
      return {
        success: true,
        message: 'NFT staking tables already exist'
      };
    }
    
    if (missingTables.includes('nft_staking_records')) {
      // Create nft_staking_records table
      const { error: createRecordsError } = await supabase.rpc('create_nft_staking_tables');
      
      if (createRecordsError) {
        return {
          success: false,
          message: `Failed to create tables: ${createRecordsError.message}`
        };
      }
    }
    
    return {
      success: true,
      message: 'NFT staking tables created successfully'
    };
  } catch (error) {
    console.error('Error creating NFT staking tables:', error);
    return {
      success: false,
      message: 'Failed to create NFT staking tables due to an error'
    };
  }
} 