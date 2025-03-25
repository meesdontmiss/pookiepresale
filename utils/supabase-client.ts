import { createClient } from '@supabase/supabase-js';
import { PublicKey } from '@solana/web3.js';

// Environment variables are automatically loaded in Next.js
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Validate URL format
if (!supabaseUrl || !supabaseUrl.startsWith('https://')) {
  console.error('Invalid Supabase URL. Make sure NEXT_PUBLIC_SUPABASE_URL is set correctly.');
}

// Validate key format
if (!supabaseKey || supabaseKey.length < 20) {
  console.error('Invalid Supabase key. Make sure NEXT_PUBLIC_SUPABASE_ANON_KEY is set correctly.');
}

// Create client with secure options
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false, // Don't persist auth session in localStorage
    autoRefreshToken: true
  }
});

// Create the database schema - only for initialization purposes
export const createSchema = async () => {
  try {
    // Verify we have the service role key (not the anon key)
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey || serviceKey === supabaseKey) {
      throw new Error('Schema creation requires service role key, not anon key');
    }
    
    // Create a special admin client with service role permissions
    const adminClient = createClient(supabaseUrl, serviceKey);
    
    // Create contributions table
    const { error: createTableError } = await adminClient.rpc('create_contributions_table');
    if (createTableError) throw createTableError;

    // Create distribution_records table
    const { error: createDistributionError } = await adminClient.rpc('create_distribution_records_table');
    if (createDistributionError) throw createDistributionError;

    // Create airdrop_batches table
    const { error: createBatchesError } = await adminClient.rpc('create_airdrop_batches_table');
    if (createBatchesError) throw createBatchesError;

    // Create airdrop_recipients table
    const { error: createRecipientsError } = await adminClient.rpc('create_airdrop_recipients_table');
    if (createRecipientsError) throw createRecipientsError;

    return { success: true };
  } catch (error) {
    console.error('Error creating schema:', error);
    return { success: false, error };
  }
};

// Record a contribution with enhanced validation
export const recordContribution = async (
  walletAddress: string,
  amount: number,
  transactionSignature?: string,
  tier: string = 'public'
) => {
  try {
    // Enhanced validation with multiple checks
    // Check if wallet address is null or empty
    if (!walletAddress || walletAddress.trim() === '') {
      throw new Error('Wallet address is required');
    }
    
    // Check if amount is valid
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      throw new Error('Amount must be a positive number');
    }
    
    // Check tier validity
    const validTiers = ['public', 'whitelist', 'private'];
    if (!validTiers.includes(tier)) {
      throw new Error('Invalid tier specified');
    }
    
    // Validate transaction signature if provided
    if (transactionSignature && 
        (transactionSignature.trim() === '' || 
         transactionSignature.length < 32 || 
         transactionSignature.length > 128)) {
      throw new Error('Invalid transaction signature format');
    }
    
    // Validate wallet address format with PublicKey
    try {
      new PublicKey(walletAddress);
    } catch (error) {
      throw new Error('Invalid Solana wallet address format');
    }

    // Store contribution in the database
    const { error: contributionError } = await supabase
      .from('contributions')
      .insert({
        wallet_address: walletAddress.trim(),
        amount: Number(amount.toFixed(9)), // Limit precision to 9 decimal places
        transaction_id: transactionSignature ? transactionSignature.trim() : null,
        tier: tier
      });

    if (contributionError) throw contributionError;

    // Update or insert into distribution_records table
    const { error: upsertError } = await supabase.rpc(
      'update_distribution_record',
      { 
        p_wallet_address: walletAddress.trim(),
        p_amount: Number(amount.toFixed(9))
      }
    );
    
    if (upsertError) throw upsertError;

    return { success: true };
  } catch (error) {
    console.error('Error recording contribution:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error recording contribution'
    };
  }
};

// Verify a contribution using transaction signature
export async function verifyContribution(transactionSignature: string) {
  try {
    // Validate the signature format
    if (!transactionSignature || transactionSignature.trim() === '' || 
        transactionSignature.length < 32 || transactionSignature.length > 128) {
      throw new Error('Invalid transaction signature format');
    }
    
    const { data, error } = await supabase
      .from('contributions')
      .select('*')
      .eq('transaction_id', transactionSignature.trim())
      .single();
    
    if (error) throw error;
    
    return { success: true, data };
  } catch (error) {
    console.error('Error verifying contribution:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error verifying contribution'
    };
  }
}

// Get total contribution for a wallet
export const getWalletContribution = async (walletAddress: string) => {
  try {
    // Validate wallet address
    if (!walletAddress || walletAddress.trim() === '') {
      throw new Error('Wallet address is required');
    }
    
    // Validate wallet address format with PublicKey
    try {
      new PublicKey(walletAddress);
    } catch (error) {
      throw new Error('Invalid Solana wallet address format');
    }
    
    const { data, error } = await supabase
      .from('distribution_records')
      .select('total_contributed')
      .eq('wallet_address', walletAddress.trim())
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 is 'no rows returned'
    
    return { 
      success: true, 
      contribution: data?.total_contributed || 0 
    };
  } catch (error) {
    console.error('Error getting wallet contribution:', error);
    return { 
      success: false, 
      contribution: 0, 
      error: error instanceof Error ? error.message : 'Unknown error getting wallet contribution'
    };
  }
};

// Get user's contributions
export async function getUserContributions(walletAddress: string) {
  try {
    // Validate wallet address
    if (!walletAddress || walletAddress.trim() === '') {
      throw new Error('Wallet address is required');
    }
    
    // Validate wallet address format with PublicKey
    try {
      new PublicKey(walletAddress);
    } catch (error) {
      throw new Error('Invalid Solana wallet address format');
    }
    
    const { data, error } = await supabase
      .from('contributions')
      .select('*')
      .eq('wallet_address', walletAddress.trim())
      .order('created_at', { ascending: false });
      
    if (error) throw error;
    
    return { success: true, data: data || [] };
  } catch (error) {
    console.error('Error fetching user contributions:', error);
    return { 
      success: false, 
      data: [], 
      error: error instanceof Error ? error.message : 'Unknown error fetching contributions'
    };
  }
}

// Get total contribution amount
export const getTotalContributions = async () => {
  try {
    const { data, error } = await supabase.rpc('get_total_contributions');
    
    if (error) throw error;
    
    return { 
      success: true, 
      totalAmount: data || 0,
    };
  } catch (error) {
    console.error('Error getting total contributions:', error);
    return { 
      success: false, 
      totalAmount: 0, 
      error: error instanceof Error ? error.message : 'Unknown error getting total contributions'
    };
  }
};

// Get total number of contributors
export const getContributorCount = async () => {
  try {
    const { data, error } = await supabase
      .from('distribution_records')
      .select('count', { count: 'exact' });
    
    if (error) throw error;
    
    return { 
      success: true, 
      count: data?.length || 0
    };
  } catch (error) {
    console.error('Error getting contributor count:', error);
    return { 
      success: false, 
      count: 0, 
      error: error instanceof Error ? error.message : 'Unknown error getting contributor count'
    };
  }
};

// Get overall contribution statistics
export async function getContributionStats() {
  try {
    const { data, error } = await supabase.rpc('get_contribution_stats');
    
    if (error) throw error;
    
    return { 
      success: true, 
      stats: data || {
        total_amount: 0,
        contributor_count: 0,
        avg_contribution: 0
      }
    };
  } catch (error) {
    console.error('Error fetching contribution stats:', error);
    return { 
      success: false, 
      stats: {
        total_amount: 0,
        contributor_count: 0,
        avg_contribution: 0
      },
      error: error instanceof Error ? error.message : 'Unknown error fetching contribution stats'
    };
  }
}

// Admin Functions for Airdrop Management - Should only be called from admin pages

// Calculate token allocations based on contributions
export const calculateTokenAllocations = async (tokenSupply: number, minContribution: number = 0) => {
  try {
    // Validate inputs
    if (typeof tokenSupply !== 'number' || tokenSupply <= 0) {
      throw new Error('Token supply must be a positive number');
    }
    
    if (typeof minContribution !== 'number' || minContribution < 0) {
      throw new Error('Minimum contribution cannot be negative');
    }
    
    const { data, error } = await supabase.rpc('calculate_token_allocations', {
      token_supply: tokenSupply,
      min_contribution: minContribution
    });
    
    if (error) throw error;
    
    return { success: true, updatedCount: data };
  } catch (error) {
    console.error('Error calculating token allocations:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error calculating allocations'
    };
  }
};

// Create a new airdrop batch
export const createAirdropBatch = async (batchName: string) => {
  try {
    // Validate batch name
    if (!batchName || batchName.trim() === '' || batchName.length > 255) {
      throw new Error('Batch name must be between 1 and 255 characters');
    }
    
    const { data, error } = await supabase.rpc('create_airdrop_batch', {
      p_batch_name: batchName.trim()
    });
    
    if (error) throw error;
    
    return { success: true, batchId: data };
  } catch (error) {
    console.error('Error creating airdrop batch:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error creating batch'
    };
  }
};

// Populate an airdrop batch with recipients
export const populateAirdropBatch = async (batchId: number, minTokens: number = 0) => {
  try {
    // Validate batch ID
    if (typeof batchId !== 'number' || batchId <= 0 || !Number.isInteger(batchId)) {
      throw new Error('Batch ID must be a positive integer');
    }
    
    // Validate min tokens
    if (typeof minTokens !== 'number' || minTokens < 0) {
      throw new Error('Minimum tokens cannot be negative');
    }
    
    const { data, error } = await supabase.rpc('populate_airdrop_batch', {
      p_batch_id: batchId,
      p_min_tokens: minTokens
    });
    
    if (error) throw error;
    
    return { success: true, recipientCount: data };
  } catch (error) {
    console.error('Error populating airdrop batch:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error populating batch'
    };
  }
};

// Mark recipients as distributed in a batch
export const markBatchDistributed = async (batchId: number, txHash: string) => {
  try {
    // Validate batch ID
    if (typeof batchId !== 'number' || batchId <= 0 || !Number.isInteger(batchId)) {
      throw new Error('Batch ID must be a positive integer');
    }
    
    // Validate transaction hash
    if (!txHash || txHash.trim() === '' || txHash.length < 32 || txHash.length > 128) {
      throw new Error('Invalid transaction hash format');
    }
    
    const { data, error } = await supabase.rpc('mark_batch_distributed', {
      p_batch_id: batchId,
      p_transaction_hash: txHash.trim()
    });
    
    if (error) throw error;
    
    return { success: true, updatedCount: data };
  } catch (error) {
    console.error('Error marking batch as distributed:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error marking batch as distributed'
    };
  }
};

// Validate Solana address format
function isValidSolanaAddress(address: string): boolean {
  // Basic validation - Solana addresses are base58 encoded and typically 44 characters
  // This is a simple check - for production, consider using @solana/web3.js for validation
  return /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(address);
} 