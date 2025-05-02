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
  ComputeBudgetProgram,
  GetLatestBlockhashConfig,
  RpcResponseAndContext,
  SignatureResult
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getMint,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import BN from 'bn.js';
import { Buffer } from 'buffer';

// Constants
// This is the correct program ID for mainnet deployment
const PROGRAM_ID = process.env.NEXT_PUBLIC_STAKING_PROGRAM_ID || 'FWcUFBDFW6Y677jcSb6cgjpYQ9dYpnNCfBWkDChHEGuq';
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
      console.log(`Creating token account for mint: ${mintAddress.toString()}`);
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
    if (!connection) throw new Error('Connection object is required');
    if (!wallet) throw new Error('Wallet public key is required');
    if (!nftMint) throw new Error('NFT mint public key is required');

    // Verify wallet has sufficient SOL for the transaction
    if (!await hasEnoughSol(connection, wallet)) {
      throw new Error(StakingError.InsufficientFunds);
    }

    // Check if NFT is already staked
    if (await isNftStaked(connection, wallet, nftMint)) {
      throw new Error('NFT is already staked.');
    }

    // Derive required accounts
    const [stakingAccount] = await findStakeAccountAddress(nftMint, wallet);

    const userNftTokenAccount = await getAssociatedTokenAddress(
      nftMint,
      wallet
    );

    // Initialize transaction
    const transaction = new Transaction();
    
    // Add compute budget instructions first
    transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }));
    transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1000000 }));

    // Instruction data
    const instructionData = Buffer.from([StakingInstruction.StakeNft]);

    // Add stake instruction
    transaction.add(new TransactionInstruction({
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: userNftTokenAccount, isSigner: false, isWritable: false },
        { pubkey: nftMint, isSigner: false, isWritable: false },
        { pubkey: stakingAccount, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: STAKING_PROGRAM_ID,
      data: instructionData,
    }));

    return transaction;

  } catch (error) {
    console.error('Error creating stake NFT transaction:', error);
    if (error instanceof Error && Object.values(StakingError).includes(error.message as StakingError)) {
      throw error; 
    }
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
    if (!connection) throw new Error('Connection object is required');
    if (!wallet) throw new Error('Wallet public key is required');
    if (!nftMint) throw new Error('NFT mint public key is required');

    // Verify wallet has sufficient SOL for the transaction
    if (!await hasEnoughSol(connection, wallet)) {
      throw new Error(StakingError.InsufficientFunds);
    }

    // Check if NFT is staked
    if (!await isNftStaked(connection, wallet, nftMint)) {
      throw new Error('NFT is not staked.');
    }

    // Derive required accounts
    const [stakingAccount] = await findStakeAccountAddress(nftMint, wallet);

    const userNftTokenAccount = await getAssociatedTokenAddress(
      nftMint,
      wallet
    );

    // Initialize transaction
    const transaction = new Transaction();

    // Add compute budget instructions first (Optional but good practice)
    transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }));
    transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 })); // Unstaking is usually less CU intensive

    // Instruction data
    const instructionData = Buffer.from([StakingInstruction.UnstakeNft]);

    // Add unstake instruction
    transaction.add(new TransactionInstruction({
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true }, // User gets lamports back
        { pubkey: userNftTokenAccount, isSigner: false, isWritable: false }, // User's NFT account, not writable by program
        { pubkey: nftMint, isSigner: false, isWritable: false },
        { pubkey: stakingAccount, isSigner: false, isWritable: true }, // Stake PDA is writable (closed)
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      ],
      programId: STAKING_PROGRAM_ID,
      data: instructionData,
    }));

    return transaction;

  } catch (error) {
    console.error('Error creating unstake NFT transaction:', error);
    if (error instanceof Error && Object.values(StakingError).includes(error.message as StakingError)) {
      throw error; 
    }
    throw new Error(StakingError.UnknownError);
  }
}

/**
 * Create a transaction to claim staking rewards
 */
export async function createClaimRewardsTransaction(
  connection: Connection,
  wallet: PublicKey,
  nftMint: PublicKey
): Promise<Transaction> {
  try {
    // Validate inputs
    if (!connection) throw new Error('Connection object is required');
    if (!wallet) throw new Error('Wallet public key is required');
    if (!nftMint) throw new Error('NFT mint public key is required');

    // Verify wallet has sufficient SOL for the transaction
    if (!await hasEnoughSol(connection, wallet)) {
      throw new Error(StakingError.InsufficientFunds);
    }

    // Check if NFT is staked (needed to claim rewards)
    if (!await isNftStaked(connection, wallet, nftMint)) {
      throw new Error('NFT must be staked to claim rewards.');
    }

    // Get staking info to check if there are rewards to claim
    const stakingInfo = await getStakingInfo(connection, wallet, nftMint);
    if (stakingInfo.currentReward <= 0) {
      throw new Error('No rewards available to claim.');
    }

    // Derive required accounts
    const [stakingAccount] = await findStakeAccountAddress(nftMint, wallet);
    const [programAuthority] = await findProgramAuthority();

    // Get user's token account for the reward mint
    const userRewardTokenAccount = await getAssociatedTokenAddress(
      REWARDS_TOKEN_MINT,
      wallet
    );

    // Initialize transaction
    const transaction = new Transaction();

    // Add compute budget instructions first
    transaction.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100000 }));
    transaction.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }));

    // Ensure user has the reward token account
    await ensureTokenAccount(connection, wallet, REWARDS_TOKEN_MINT, transaction);

    // Instruction data
    const instructionData = Buffer.from([StakingInstruction.ClaimRewards]);

    // Add claim rewards instruction
    transaction.add(new TransactionInstruction({
      keys: [
        { pubkey: wallet, isSigner: true, isWritable: true },
        { pubkey: stakingAccount, isSigner: false, isWritable: true },
        { pubkey: nftMint, isSigner: false, isWritable: false },
        { pubkey: userRewardTokenAccount, isSigner: false, isWritable: true },
        { pubkey: REWARDS_TREASURY, isSigner: false, isWritable: true },
        { pubkey: programAuthority, isSigner: false, isWritable: false },
        { pubkey: REWARDS_TOKEN_MINT, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
      ],
      programId: STAKING_PROGRAM_ID,
      data: instructionData,
    }));

    return transaction;

  } catch (error) {
    console.error('Error creating claim rewards transaction:', error);
    if (error instanceof Error && Object.values(StakingError).includes(error.message as StakingError)) {
      throw error; 
    }
    throw new Error(StakingError.UnknownError);
  }
}

/**
 * Send and confirm a transaction
 */
export async function sendTransaction(
  transaction: Transaction,
  connection: Connection,
  wallet: { publicKey: PublicKey, signTransaction: (tx: Transaction) => Promise<Transaction> },
  commitment: Commitment = 'confirmed'
): Promise<string> {
  let retries = MAX_RETRIES;
  while (retries > 0) {
    try {
      // Get latest blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(commitment);
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = wallet.publicKey;

      // Sign the transaction
      const signedTransaction = await wallet.signTransaction(transaction);
      
      // Send the transaction
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      
      console.log('Transaction sent with signature:', signature);
      
      // Confirm the transaction
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, commitment);
      
      if (confirmation.value.err) {
        console.error('Transaction confirmation error:', confirmation.value.err);
        throw new Error('Transaction failed confirmation');
      }
      
      console.log('Transaction confirmed:', signature);
      return signature;

    } catch (error) {
      console.error(`Transaction failed (attempt ${MAX_RETRIES - retries + 1}/${MAX_RETRIES}):`, error);
      retries--;
      if (retries === 0) {
        if (error instanceof Error) throw error;
        throw new Error(StakingError.TransactionFailed);
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  throw new Error(StakingError.TransactionFailed);
}

/**
 * Check if an NFT is staked by looking for the staking account PDA
 */
export async function isNftStaked(
  connection: Connection,
  wallet: PublicKey,
  nftMint: PublicKey
): Promise<boolean> {
  try {
    if (!connection) throw new Error('Connection object is required');
    if (!wallet) throw new Error('Wallet public key is required');
    if (!nftMint) throw new Error('NFT mint public key is required');

    // Find the staking account PDA
    const [stakingAccount] = await findStakeAccountAddress(nftMint, wallet);
    
    // Check if the staking account exists
    const accountInfo = await connection.getAccountInfo(stakingAccount);
    return !!accountInfo;

  } catch (error) {
    console.error('Error checking if NFT is staked:', error);
    return false;
  }
}

/**
 * Get staking information for a specific NFT
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
  const defaultInfo = {
    isStaked: false,
    stakedAt: 0,
    daysStaked: 0,
    currentReward: 0
  };

  try {
    if (!connection) throw new Error('Connection object is required');
    if (!wallet) throw new Error('Wallet public key is required');
    if (!nftMint) throw new Error('NFT mint public key is required');

    // Check if NFT is staked
    const isStakedResult = await isNftStaked(connection, wallet, nftMint);
    if (!isStakedResult) return defaultInfo;

    // Find the staking account PDA
    const [stakingAccount] = await findStakeAccountAddress(nftMint, wallet);

    // Get account info
    const accountInfo = await connection.getAccountInfo(stakingAccount);
    if (!accountInfo) return defaultInfo;

    // Decode account data (assuming specific layout)
    const data = Buffer.from(accountInfo.data);
    if (data.length < 8 + 32 + 32 + 8 + 8) { 
      console.error('Staking account data length too short to decode timestamps');
      return { ...defaultInfo, isStaked: true };
    }
    const stakedAtTimestampBN = new BN(data.slice(8 + 32 + 32, 8 + 32 + 32 + 8), 'le');
    const stakedAtTimestamp = stakedAtTimestampBN.toNumber();
    const lastClaimedAtTimestampBN = new BN(data.slice(8 + 32 + 32 + 8, 8 + 32 + 32 + 8 + 8), 'le');
    const lastClaimedAtTimestamp = lastClaimedAtTimestampBN.toNumber();

    // Calculate days staked and rewards based on the later timestamp
    const now = Math.floor(Date.now() / 1000);
    const startTime = Math.max(stakedAtTimestamp, lastClaimedAtTimestamp);
    const secondsSinceStart = Math.max(0, now - startTime);
    const daysSinceStart = secondsSinceStart / (60 * 60 * 24);
    const currentReward = daysSinceStart * DAILY_REWARD_RATE;

    return {
      isStaked: true,
      stakedAt: stakedAtTimestamp,
      daysStaked: parseFloat(daysSinceStart.toFixed(2)),
      currentReward: Math.floor(currentReward)
    };

  } catch (error) {
    console.error('Error getting staking info:', error);
    return defaultInfo;
  }
}

/**
 * Get token balance for a specific mint
 */
export async function getTokenBalance(
  connection: Connection,
  wallet: PublicKey,
  mint: PublicKey
): Promise<number> {
  try {
    if (!connection || !wallet || !mint) return 0;
    
    const tokenAccount = await getAssociatedTokenAddress(mint, wallet);
    const accountInfo = await getAccount(connection, tokenAccount);
    
    const mintInfo = await getMint(connection, mint);
    const balance = Number(accountInfo.amount) / (10 ** mintInfo.decimals);
    return balance;
    
  } catch (error) {
    if (error instanceof Error && (error.name === 'TokenAccountNotFoundError' || error.message.includes('could not find account'))) {
    } else {
        console.warn(`Warning getting token balance for mint ${mint.toString()}:`, error);
    }
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
    if (!connection) throw new Error('Connection object is required');
    if (!wallet) throw new Error('Wallet public key is required');

    // Constants for calculation
    const STAKE_ACCOUNT_SIZE = 89; // 1 (bool) + 32 (owner) + 32 (mint) + 8 (stake_time) + 8 (last_claim_time)
    const FEES_BUFFER = 5000 + 10000; // Base fee + buffer for compute/priority

    // Get current balance
    const balance = await connection.getBalance(wallet);

    // Calculate rent needed for the stake account
    const rentExemptionCost = await connection.getMinimumBalanceForRentExemption(STAKE_ACCOUNT_SIZE);

    // Estimate max cost (rent for new stake account + fees)
    // Note: Rent is only paid if the stake account doesn't exist yet.
    // This check assumes the worst case (needs to pay rent).
    const estimatedMaxCost = rentExemptionCost + FEES_BUFFER;
    
    console.log(`Wallet balance: ${balance / (10**9)} SOL`);
    console.log(`Estimated max cost (Rent + Fees): ${estimatedMaxCost / (10**9)} SOL`);

    if (balance < estimatedMaxCost) {
      console.warn("Potential low balance for first-time stake rent + fees.");
      // You could be stricter here and return false, or just warn.
      // Let's be stricter to prevent failures:
      return false; 
    } else {
      // Also check against a basic minimum even if rent might not be needed
      const basicMinimum = 0.001 * (10 ** 9); // e.g., 0.001 SOL minimum always
      if (balance < basicMinimum) {
        console.warn("Balance below basic minimum.");
        return false;
      }
    }
    
    return true; // Sufficient balance for worst-case or basic minimum

  } catch (error) {
    console.error(`Error checking SOL balance using endpoint ${connection.rpcEndpoint}:`, error);
    return false;
  }
}

/**
 * Batch get staking information for multiple NFTs
 */
export async function getMultipleStakingInfo(
  connection: Connection,
  wallet: PublicKey,
  nftMints: PublicKey[]
): Promise<Map<string, {
  isStaked: boolean;
  stakedAt: number;
  daysStaked: number;
  currentReward: number;
  lastClaimTime: number;
}>> {
  const resultsMap = new Map<string, { isStaked: boolean; stakedAt: number; daysStaked: number; currentReward: number; lastClaimTime: number }>();
  if (!connection || !wallet || nftMints.length === 0) {
    return resultsMap;
  }

  try {
    // Derive all stake account PDAs
    const stakeAccountPromises = nftMints.map(mint => findStakeAccountAddress(mint, wallet));
    const stakeAccountAddressesWithBumps = await Promise.all(stakeAccountPromises);
    const stakeAccountAddresses = stakeAccountAddressesWithBumps.map(([address]) => address);

    // Fetch all account infos in a single batch
    const accountInfos = await connection.getMultipleAccountsInfo(stakeAccountAddresses);

    const now = Math.floor(Date.now() / 1000);

    // Process the results
    accountInfos.forEach((accountInfo, index) => {
      const mint = nftMints[index].toString();
      if (accountInfo) {
        // NFT is staked
        try {
          const data = Buffer.from(accountInfo.data);
          if (data.length < 8 + 32 + 32 + 8 + 8) { 
            console.error(`Staking account data length for mint ${mint} too short.`);
            resultsMap.set(mint, { isStaked: true, stakedAt: 0, daysStaked: 0, currentReward: 0, lastClaimTime: 0 });
          } else {
            const stakedAtTimestampBN = new BN(data.slice(8 + 32 + 32, 8 + 32 + 32 + 8), 'le');
            const stakedAtTimestamp = stakedAtTimestampBN.toNumber();
            const lastClaimedAtTimestampBN = new BN(data.slice(8 + 32 + 32 + 8, 8 + 32 + 32 + 8 + 8), 'le');
            const lastClaimedAtTimestamp = lastClaimedAtTimestampBN.toNumber();

            const startTime = Math.max(stakedAtTimestamp, lastClaimedAtTimestamp);
            const secondsSinceStart = Math.max(0, now - startTime);
            const daysSinceStart = secondsSinceStart / (60 * 60 * 24);
            const currentReward = daysSinceStart * DAILY_REWARD_RATE;

            resultsMap.set(mint, {
              isStaked: true,
              stakedAt: stakedAtTimestamp,
              daysStaked: parseFloat(daysSinceStart.toFixed(2)),
              currentReward: Math.floor(currentReward),
              lastClaimTime: lastClaimedAtTimestamp
            });
          }
        } catch (decodeError) {
           console.error(`Error decoding staking account data for mint ${mint}:`, decodeError);
           resultsMap.set(mint, { isStaked: true, stakedAt: 0, daysStaked: 0, currentReward: 0, lastClaimTime: 0 }); // Mark as staked but with default/zeroed info
        }
      } else {
        // NFT is not staked
        resultsMap.set(mint, {
          isStaked: false,
          stakedAt: 0,
          daysStaked: 0,
          currentReward: 0,
          lastClaimTime: 0
        });
      }
    });

  } catch (error) {
    console.error('Error in getMultipleStakingInfo:', error);
    // In case of a batch error, return an empty map or partial map based on available data
    // For simplicity, return the map as it is (might be partially filled or empty)
  }

  return resultsMap;
} 