import { 
  Connection, 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_CLOCK_PUBKEY,
  sendAndConfirmTransaction,
  Keypair,
  Commitment,
  Signer,
  TransactionSignature,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getMint,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { BN } from 'bn.js';
import { Buffer } from 'buffer';

// Constants
const PROGRAM_ID = process.env.NEXT_PUBLIC_STAKING_PROGRAM_ID || 'FfMi15fPPvYUpnMrCMPPH5FPJEohgR5sMyJDbdagAKqQ';
const COLLECTION_ADDRESS = process.env.NEXT_PUBLIC_POOKIE_COLLECTION_ADDRESS || '11111111111111111111111111111111';
const POOKIE_TOKEN_MINT = process.env.NEXT_PUBLIC_POOKIE_TOKEN_MINT || '11111111111111111111111111111111';
const TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_ADDRESS || '11111111111111111111111111111111';

// Staking program constants
export const STAKING_PROGRAM_ID = new PublicKey(PROGRAM_ID);
export const REWARDS_TOKEN_MINT = new PublicKey(POOKIE_TOKEN_MINT);
export const REWARDS_TREASURY = new PublicKey(TREASURY_ADDRESS);

// Daily reward rate constants
export const DAILY_REWARD_RATE = 250; // 250 tokens per day

// Check if required environment variables are set
if (!PROGRAM_ID) {
  console.error('⚠️ NEXT_PUBLIC_STAKING_PROGRAM_ID not set in environment variables');
}

if (!COLLECTION_ADDRESS) {
  console.error('⚠️ NEXT_PUBLIC_POOKIE_COLLECTION_ADDRESS not set in environment variables');
}

if (!POOKIE_TOKEN_MINT) {
  console.error('⚠️ NEXT_PUBLIC_POOKIE_TOKEN_MINT not set in environment variables');
}

if (!TREASURY_ADDRESS) {
  console.error('⚠️ NEXT_PUBLIC_TREASURY_ADDRESS not set in environment variables');
}

// Instruction types
export enum StakingInstruction {
  StakeNft = 0,
  UnstakeNft = 1,
  ClaimRewards = 2,
}

// Error types
export enum StakingError {
  TokenAccountNotFound = 'Token account not found',
  InsufficientFunds = 'Insufficient funds',
  InvalidMint = 'Invalid mint',
  MissingEnvironmentVariable = 'Missing environment variable',
  InvalidProgramId = 'Invalid program ID',
  TransactionFailed = 'Transaction failed',
  UnknownError = 'Unknown error',
}

// Transaction timeouts and retries
const TX_TIMEOUT = 60000; // 60 seconds
const MAX_RETRIES = 3;

/**
 * Find the stake account address for a specific NFT and wallet
 */
export async function findStakeAccountAddress(
  nftMint: PublicKey,
  walletAddress: PublicKey,
  programId: PublicKey = new PublicKey(PROGRAM_ID || '')
): Promise<[PublicKey, number]> {
  if (!PROGRAM_ID) {
    throw new Error(StakingError.MissingEnvironmentVariable);
  }

  return PublicKey.findProgramAddress(
    [
      Buffer.from('stake'),
      nftMint.toBuffer(),
      walletAddress.toBuffer(),
    ],
    programId
  );
}

/**
 * Find the program authority address
 */
export async function findProgramAuthority(
  programId: PublicKey = new PublicKey(PROGRAM_ID || '')
): Promise<[PublicKey, number]> {
  if (!PROGRAM_ID) {
    throw new Error(StakingError.MissingEnvironmentVariable);
  }

  return PublicKey.findProgramAddress(
    [Buffer.from('authority')],
    programId
  );
}

/**
 * Ensure a token account exists for the given wallet and mint
 * Creates it if it doesn't exist
 */
export async function ensureTokenAccount(
  connection: Connection,
  walletAddress: PublicKey,
  mintAddress: PublicKey,
  transaction: Transaction
): Promise<PublicKey> {
  try {
    // Get the token account address
    const tokenAccount = await getAssociatedTokenAddress(
      mintAddress,
      walletAddress
    );
    
    // Check if the token account exists
    try {
      await getAccount(connection, tokenAccount);
    } catch (error) {
      // If the account doesn't exist, create it
      console.log('Creating token account for mint:', mintAddress.toString());
      transaction.add(
        createAssociatedTokenAccountInstruction(
          walletAddress,
          tokenAccount,
          walletAddress,
          mintAddress
        )
      );
    }
    
    return tokenAccount;
  } catch (error) {
    console.error('Error ensuring token account:', error);
    throw new Error(StakingError.TokenAccountNotFound);
  }
}

/**
 * Create a transaction to stake an NFT
 */
export async function createStakeNftTransaction(
  connection: Connection,
  wallet: PublicKey,
  nftMint: PublicKey
): Promise<Transaction> {
  try {
    // Validate inputs
    if (!connection) throw new Error(StakingError.MissingEnvironmentVariable);
    if (!wallet) throw new Error(StakingError.MissingEnvironmentVariable);
    if (!nftMint) throw new Error(StakingError.MissingEnvironmentVariable);

    // Verify wallet has sufficient SOL for the transaction
    if (!await hasEnoughSol(connection, wallet)) {
      throw new Error(StakingError.InsufficientFunds);
    }

    // Check if NFT is already staked
    if (await isNftStaked(connection, wallet, nftMint)) {
      throw new Error(StakingError.UnknownError);
    }

    // Derive required accounts
    const [stakingAccount] = await PublicKey.findProgramAddress(
      [Buffer.from('staking'), wallet.toBuffer(), nftMint.toBuffer()],
      STAKING_PROGRAM_ID
    );

    const userNftTokenAccount = await getAssociatedTokenAddress(
      nftMint,
      wallet,
      false
    );

    const programNftTokenAccount = await getAssociatedTokenAddress(
      nftMint,
      stakingAccount,
      true
    );

    // Create transaction
    const transaction = new Transaction();

    // Add compute budget instruction to increase compute units if needed
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 300000, // Adjust based on program needs
      })
    );

    // Check if the program's token account exists, if not create it
    try {
      await connection.getTokenAccountBalance(programNftTokenAccount);
    } catch (error) {
      // Account doesn't exist, create it
      transaction.add(
        createAssociatedTokenAccountInstruction(
          wallet,
          programNftTokenAccount,
          stakingAccount,
          nftMint
        )
      );
    }

    // Create the stake instruction
    const stakeInstruction = new TransactionInstruction({
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: stakingAccount, isSigner: false, isWritable: true },
        { pubkey: userNftTokenAccount, isSigner: false, isWritable: true },
        { pubkey: programNftTokenAccount, isSigner: false, isWritable: true },
        { pubkey: nftMint, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: STAKING_PROGRAM_ID,
      data: Buffer.from([0]), // '0' represents the stake instruction
    });

    transaction.add(stakeInstruction);

    // Add recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet;

    return transaction;
  } catch (error) {
    if (error instanceof Error) throw error;
    console.error('Error creating stake transaction:', error);
    throw new Error(StakingError.UnknownError);
  }
}

/**
 * Create a transaction to unstake an NFT
 */
export async function createUnstakeNftTransaction(
  connection: Connection,
  wallet: PublicKey,
  nftMint: PublicKey
): Promise<Transaction> {
  try {
    // Validate inputs
    if (!connection) throw new Error(StakingError.MissingEnvironmentVariable);
    if (!wallet) throw new Error(StakingError.MissingEnvironmentVariable);
    if (!nftMint) throw new Error(StakingError.MissingEnvironmentVariable);

    // Verify wallet has sufficient SOL for the transaction
    if (!await hasEnoughSol(connection, wallet)) {
      throw new Error(StakingError.InsufficientFunds);
    }

    // Check if NFT is actually staked
    if (!await isNftStaked(connection, wallet, nftMint)) {
      throw new Error(StakingError.UnknownError);
    }

    // Derive required accounts
    const [stakingAccount] = await PublicKey.findProgramAddress(
      [Buffer.from('staking'), wallet.toBuffer(), nftMint.toBuffer()],
      STAKING_PROGRAM_ID
    );

    const userNftTokenAccount = await getAssociatedTokenAddress(
      nftMint,
      wallet,
      false
    );

    const programNftTokenAccount = await getAssociatedTokenAddress(
      nftMint,
      stakingAccount,
      true
    );

    // Create transaction
    const transaction = new Transaction();

    // Add compute budget instruction to increase compute units if needed
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 300000, // Adjust based on program needs
      })
    );

    // Create the unstake instruction
    const unstakeInstruction = new TransactionInstruction({
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: stakingAccount, isSigner: false, isWritable: true },
        { pubkey: userNftTokenAccount, isSigner: false, isWritable: true },
        { pubkey: programNftTokenAccount, isSigner: false, isWritable: true },
        { pubkey: nftMint, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: STAKING_PROGRAM_ID,
      data: Buffer.from([1]), // '1' represents the unstake instruction
    });

    transaction.add(unstakeInstruction);

    // Add recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet;

    return transaction;
  } catch (error) {
    if (error instanceof Error) throw error;
    console.error('Error creating unstake transaction:', error);
    throw new Error(StakingError.UnknownError);
  }
}

/**
 * Create a transaction to claim rewards for a staked NFT
 */
export async function createClaimRewardsTransaction(
  connection: Connection,
  wallet: PublicKey,
  nftMint: PublicKey
): Promise<Transaction> {
  try {
    // Validate inputs
    if (!connection) throw new Error(StakingError.MissingEnvironmentVariable);
    if (!wallet) throw new Error(StakingError.MissingEnvironmentVariable);
    if (!nftMint) throw new Error(StakingError.MissingEnvironmentVariable);

    // Verify wallet has sufficient SOL for the transaction
    if (!await hasEnoughSol(connection, wallet)) {
      throw new Error(StakingError.InsufficientFunds);
    }

    // Check if NFT is staked
    if (!await isNftStaked(connection, wallet, nftMint)) {
      throw new Error(StakingError.UnknownError);
    }

    // Get staking info to check if there are rewards to claim
    const stakingInfo = await getStakingInfo(connection, wallet, nftMint);
    if (stakingInfo.currentReward <= 0) {
      throw new Error(StakingError.UnknownError);
    }

    // Derive required accounts
    const [stakingAccount] = await PublicKey.findProgramAddress(
      [Buffer.from('staking'), wallet.toBuffer(), nftMint.toBuffer()],
      STAKING_PROGRAM_ID
    );

    const userRewardsTokenAccount = await getAssociatedTokenAddress(
      REWARDS_TOKEN_MINT,
      wallet,
      false
    );

    const treasuryTokenAccount = await getAssociatedTokenAddress(
      REWARDS_TOKEN_MINT,
      REWARDS_TREASURY,
      true
    );

    // Create transaction
    const transaction = new Transaction();

    // Add compute budget instruction to increase compute units if needed
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: 300000, // Adjust based on program needs
      })
    );

    // Check if the user's token account exists, if not create it
    try {
      await connection.getTokenAccountBalance(userRewardsTokenAccount);
    } catch (error) {
      // Account doesn't exist, create it
      transaction.add(
        createAssociatedTokenAccountInstruction(
          wallet,
          userRewardsTokenAccount,
          wallet,
          REWARDS_TOKEN_MINT
        )
      );
    }

    // Create the claim rewards instruction
    const claimRewardsInstruction = new TransactionInstruction({
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: stakingAccount, isSigner: false, isWritable: true },
        { pubkey: userRewardsTokenAccount, isSigner: false, isWritable: true },
        { pubkey: treasuryTokenAccount, isSigner: false, isWritable: true },
        { pubkey: REWARDS_TOKEN_MINT, isSigner: false, isWritable: false },
        { pubkey: REWARDS_TREASURY, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: STAKING_PROGRAM_ID,
      data: Buffer.from([2]), // '2' represents the claim rewards instruction
    });

    transaction.add(claimRewardsInstruction);

    // Add recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet;

    return transaction;
  } catch (error) {
    if (error instanceof Error) throw error;
    console.error('Error creating claim rewards transaction:', error);
    throw new Error(StakingError.UnknownError);
  }
}

/**
 * Send a transaction and wait for confirmation
 */
export async function sendTransaction(
  transaction: Transaction,
  connection: Connection,
  wallet: { publicKey: PublicKey, signTransaction: (tx: Transaction) => Promise<Transaction> },
  commitment: Commitment = 'confirmed'
): Promise<string> {
  let signature = '';
  let retries = 0;
  
  while (retries < MAX_RETRIES) {
    try {
      // Sign the transaction
      const signedTransaction = await wallet.signTransaction(transaction);
      
      // Send the transaction
      const sendPromise = connection.sendRawTransaction(signedTransaction.serialize());
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Transaction timeout')), TX_TIMEOUT)
      );
      
      signature = await Promise.race([sendPromise, timeoutPromise]);
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash: transaction.recentBlockhash,
        lastValidBlockHeight: transaction.lastValidBlockHeight
      }, commitment);
      
      if (confirmation.value.err) {
        throw new Error(`Transaction confirmed but failed: ${confirmation.value.err.toString()}`);
      }
      
      return signature;
    } catch (error) {
      retries++;
      console.error(`Transaction attempt ${retries} failed:`, error);
      
      if (retries >= MAX_RETRIES) {
        throw new Error(StakingError.TransactionFailed);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get new blockhash for retry
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
    }
  }
  
  return signature;
}

/**
 * Check if a given NFT is staked by a wallet
 */
export async function isNftStaked(
  connection: Connection,
  wallet: PublicKey,
  nftMint: PublicKey
): Promise<boolean> {
  try {
    // Derive staking account PDA
    const [stakingAccount] = await PublicKey.findProgramAddress(
      [Buffer.from('staking'), wallet.toBuffer(), nftMint.toBuffer()],
      STAKING_PROGRAM_ID
    );

    // Check if the staking account exists
    const accountInfo = await connection.getAccountInfo(stakingAccount);
    if (!accountInfo) return false;

    // Check the account data to verify it's a valid staking account
    // This is a simplified check, real implementation would parse the account data
    return accountInfo.owner.equals(STAKING_PROGRAM_ID) && accountInfo.data.length > 0;
  } catch (error) {
    console.error('Error checking if NFT is staked:', error);
    return false;
  }
}

/**
 * Get staking info for an NFT
 */
export async function getStakingInfo(
  connection: Connection,
  wallet: PublicKey,
  nftMint: PublicKey
): Promise<{
  isStaked: boolean;
  stakedAt: number;
  daysStaked: number;
  currentReward: number
}> {
  try {
    // Default return value
    const defaultInfo = {
      isStaked: false,
      stakedAt: 0,
      daysStaked: 0,
      currentReward: 0
    };

    // Check if NFT is staked
    const staked = await isNftStaked(connection, wallet, nftMint);
    if (!staked) return defaultInfo;

    // Derive staking account PDA
    const [stakingAccount] = await PublicKey.findProgramAddress(
      [Buffer.from('staking'), wallet.toBuffer(), nftMint.toBuffer()],
      STAKING_PROGRAM_ID
    );

    // Get account info
    const accountInfo = await connection.getAccountInfo(stakingAccount);
    if (!accountInfo) return defaultInfo;

    // Parse staking account data (simplified for example)
    // In a real implementation, you would deserialize the account data based on your program's data structure
    const dataView = new DataView(accountInfo.data.buffer);
    
    // Example parsing - adjust based on actual data structure
    const stakedAt = dataView.getUint32(1, true); // Assuming staked_at timestamp is at offset 1, little endian
    
    // Calculate days staked
    const currentTime = Math.floor(Date.now() / 1000);
    const secondsStaked = currentTime - stakedAt;
    const daysStaked = Math.floor(secondsStaked / (24 * 60 * 60));
    
    // Calculate current reward based on days staked and daily rate
    const currentReward = daysStaked * DAILY_REWARD_RATE;

    return {
      isStaked: true,
      stakedAt,
      daysStaked,
      currentReward
    };
  } catch (error) {
    console.error('Error getting staking info:', error);
    return defaultInfo;
  }
}

/**
 * Get token balance for an account
 */
export async function getTokenBalance(
  connection: Connection,
  wallet: PublicKey,
  mint: PublicKey
): Promise<number> {
  try {
    const tokenAccount = await getAssociatedTokenAddress(mint, wallet);
    
    try {
      const balance = await connection.getTokenAccountBalance(tokenAccount);
      return Number(balance.value.amount) / (10 ** balance.value.decimals);
    } catch (error) {
      // Token account doesn't exist
      return 0;
    }
  } catch (error) {
    console.error('Error getting token balance:', error);
    return 0;
  }
}

/**
 * Check if wallet has enough SOL for transaction
 */
export async function hasEnoughSol(
  connection: Connection,
  wallet: PublicKey
): Promise<boolean> {
  try {
    const balance = await connection.getBalance(wallet);
    const minimumBalance = 0.005 * 10 ** 9; // 0.005 SOL in lamports
    return balance >= minimumBalance;
  } catch (error) {
    console.error('Error checking SOL balance:', error);
    return false;
  }
} 