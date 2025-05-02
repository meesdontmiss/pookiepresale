use solana_program::{
    account_info::{next_account_info, AccountInfo},
    clock::Clock,
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::invoke_signed,
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack, Sealed},
    pubkey::Pubkey,
    rent::Rent,
    system_instruction,
    sysvar::Sysvar,
};
use spl_token::instruction as token_instruction;
use thiserror::Error;
use arrayref::{array_ref, array_refs, array_mut_ref, mut_array_refs};

// Import our instruction module
mod instruction;
pub use instruction::StakingInstruction;

// Define errors
#[derive(Error, Debug, Copy, Clone)]
pub enum StakingError {
    #[error("Invalid instruction")]
    InvalidInstruction,
    
    #[error("Account not rent exempt")]
    NotRentExempt,
    
    #[error("Account not initialized")]
    NotInitialized,
    
    #[error("Account already initialized")]
    AlreadyInitialized,
    
    #[error("Invalid account owner")]
    InvalidOwner,
    
    #[error("Invalid token account")]
    InvalidTokenAccount,
    
    #[error("Insufficient rewards available")]
    InsufficientRewards,
    
    #[error("Invalid mint")]
    InvalidMint,
    
    #[error("Invalid PDA")]
    InvalidPDA,
    
    #[error("Invalid token account owner")]
    InvalidTokenAccountOwner,

    #[error("Lamport transfer calculation overflowed")]
    LamportTransferOverflow,

    #[error("Arithmetic overflow")]
    ArithmeticOverflow,

    #[error("Insufficient funds")]
    InsufficientFunds,
}

impl From<StakingError> for ProgramError {
    fn from(e: StakingError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

// Program entrypoint
entrypoint!(process_instruction);

// Program instruction processor
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    // Unpack the instruction
    let instruction = StakingInstruction::unpack(instruction_data)?;

    // Process the instruction
    match instruction {
        StakingInstruction::StakeNft => stake_nft(program_id, accounts),
        StakingInstruction::UnstakeNft => unstake_nft(program_id, accounts),
        StakingInstruction::ClaimRewards => claim_rewards(program_id, accounts),
    }
}

// NFT Staking data structure
#[derive(Clone, Debug, Default, PartialEq)]
pub struct StakeAccount {
    pub is_initialized: bool,
    pub owner: Pubkey,
    pub nft_mint: Pubkey,
    pub stake_time: i64,
    pub last_claim_time: i64,
}

impl Sealed for StakeAccount {}

impl IsInitialized for StakeAccount {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Pack for StakeAccount {
    const LEN: usize = 1 + 32 + 32 + 8 + 8; // is_initialized + owner + nft_mint + stake_time + last_claim_time

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let src = array_ref![src, 0, StakeAccount::LEN];
        let (
            is_initialized_src,
            owner_src,
            nft_mint_src,
            stake_time_src,
            last_claim_time_src,
        ) = array_refs![src, 1, 32, 32, 8, 8];
        
        let is_initialized = is_initialized_src[0] != 0;
        let owner = Pubkey::new_from_array(*owner_src);
        let nft_mint = Pubkey::new_from_array(*nft_mint_src);
        let stake_time = i64::from_le_bytes(*stake_time_src);
        let last_claim_time = i64::from_le_bytes(*last_claim_time_src);

        if is_initialized {
            Ok(StakeAccount {
                is_initialized,
                owner,
                nft_mint,
                stake_time,
                last_claim_time,
            })
        } else {
            // Handle case where the account is not initialized, maybe return default or error
            // For now, returning default if not initialized based on flag
            Ok(StakeAccount::default()) // Or return an error like ProgramError::UninitializedAccount
        }
    }

    fn pack_into_slice(&self, dst_slice: &mut [u8]) {
        // Get a mutable reference to the part of the slice we need, as a fixed-size array
        let dst_array_ref = array_mut_ref![dst_slice, 0, StakeAccount::LEN];

        // Destructure the mutable array reference into mutable references to its parts
        let (
            is_initialized_dst,
            owner_dst,
            nft_mint_dst,
            stake_time_dst,
            last_claim_time_dst,
        ) = mut_array_refs![dst_array_ref, 1, 32, 32, 8, 8]; // Apply to dst_array_ref

        is_initialized_dst[0] = self.is_initialized as u8;
        owner_dst.copy_from_slice(self.owner.as_ref());
        nft_mint_dst.copy_from_slice(self.nft_mint.as_ref());
        *stake_time_dst = self.stake_time.to_le_bytes();
        *last_claim_time_dst = self.last_claim_time.to_le_bytes();
    }
}

// Helper function to find PDA for stake account
fn find_stake_account_address(
    nft_mint: &Pubkey,
    user_wallet: &Pubkey,
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            b"stake",
            nft_mint.as_ref(),
            user_wallet.as_ref(),
        ],
        program_id,
    )
}

// Helper function to find PDA for the program's authority
fn find_program_authority(
    program_id: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"authority"],
        program_id,
    )
}

// Validate token account
fn validate_token_account(
    token_account: &AccountInfo,
    expected_owner: &Pubkey,
    expected_mint: &Pubkey,
    token_program: &AccountInfo,
    check_balance: bool, // Add flag to optionally check balance
) -> Result<(), ProgramError> {
    if token_account.owner != token_program.key {
        msg!("Token account not owned by token program");
        return Err(StakingError::InvalidTokenAccount.into());
    }

    let token_account_data = token_account.try_borrow_data()?;
    
    let account_mint = Pubkey::new_from_array(*array_ref![token_account_data, 0, 32]);
    if account_mint != *expected_mint {
        msg!("Token account mint does not match expected mint");
        return Err(StakingError::InvalidMint.into());
    }
    
    let account_owner = Pubkey::new_from_array(*array_ref![token_account_data, 32, 32]);
    if account_owner != *expected_owner {
        msg!("Token account owner does not match expected owner");
        return Err(StakingError::InvalidTokenAccountOwner.into());
    }

    // Optionally check if the account holds exactly 1 token
    if check_balance {
        let amount = u64::from_le_bytes(*array_ref![token_account_data, 64, 8]);
        if amount != 1 {
            msg!("NFT Token account does not hold exactly one token");
            // Consider a more specific error, reusing InvalidTokenAccount for now
            return Err(StakingError::InvalidTokenAccount.into()); 
        }
    }

    Ok(())
}

// Stake an NFT
fn stake_nft(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    msg!("Instruction: Stake NFT (Non-Transfer)");
    let accounts_iter = &mut accounts.iter();

    // Get accounts (Removed pda_token_account)
    let user = next_account_info(accounts_iter)?;
    let nft_token_account = next_account_info(accounts_iter)?;
    let nft_mint = next_account_info(accounts_iter)?;
    let stake_account = next_account_info(accounts_iter)?;
    let token_program = next_account_info(accounts_iter)?;
    let rent_info = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;
    let clock_info = next_account_info(accounts_iter)?;

    if !user.is_signer {
        msg!("User must be signer");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify the user's token account: check owner, mint, and that they hold exactly 1 token.
    // This implicitly checks that the account is not frozen because frozen accounts can't have their balance read easily?
    // Re-verify this assumption - getAccountInfo should work on frozen accounts.
    // A better check might be needed if frozen accounts are still an issue for reading data.
    // For now, rely on validate_token_account with check_balance = true
    validate_token_account(nft_token_account, user.key, nft_mint.key, token_program, true)?;

    // Compute stake account PDA
    let (stake_account_pda, bump_seed) = find_stake_account_address(
        nft_mint.key,
        user.key,
        program_id,
    );

    if stake_account_pda != *stake_account.key {
        msg!("Stake account address does not match the derived PDA");
        return Err(StakingError::InvalidPDA.into());
    }

    // REMOVED program authority PDA derivation - not needed for signing transfers
    // REMOVED program's NFT token account validation - not used

    // Create stake account if it doesn't exist
    if stake_account.data_is_empty() {
        msg!("Creating new stake account PDA");
        let rent = &Rent::from_account_info(rent_info)?;
        let space = StakeAccount::LEN;
        let lamports = rent.minimum_balance(space);

        invoke_signed(
            &system_instruction::create_account(
                user.key, // Payer
                stake_account.key, // New account address
                lamports,
                space as u64,
                program_id, // Owner
            ),
            &[
                user.clone(),
                stake_account.clone(),
                system_program.clone(),
            ],
            &[&[
                b"stake",
                nft_mint.key.as_ref(),
                user.key.as_ref(),
                &[bump_seed],
            ]],
        )?;
        msg!("Stake account PDA created");
    } else {
        // If account exists, make sure it's not already initialized
        // Use unpack_unchecked because we only care about the is_initialized flag here
        let stake_data = StakeAccount::unpack_unchecked(&stake_account.data.borrow())?;
        if stake_data.is_initialized {
            msg!("Stake account is already initialized for this NFT");
            return Err(StakingError::AlreadyInitialized.into());
        }
        // If not initialized, we'll overwrite it later
        msg!("Stake account PDA exists but is uninitialized. Proceeding.");
    }
    
    // REMOVED NFT Transfer instruction

    // Get current time
    let clock = Clock::from_account_info(clock_info)?;
    let current_time = clock.unix_timestamp;

    // Initialize stake account data
    msg!("Initializing stake account data");
    // No need to unpack_unchecked again, just create the data directly
    let stake_data = StakeAccount {
        is_initialized: true,
        owner: *user.key,
        nft_mint: *nft_mint.key,
        stake_time: current_time,
        last_claim_time: current_time,
    };
    StakeAccount::pack(stake_data, &mut stake_account.data.borrow_mut())?;
    msg!("Stake account data initialized successfully");

    msg!("NFT Staked (Non-Transfer) Successfully!");
    Ok(())
}

// Unstake an NFT
fn unstake_nft(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    msg!("Instruction: Unstake NFT (Non-Transfer)");
    let accounts_iter = &mut accounts.iter();

    // Get accounts (Removed pda_token_account and program_authority)
    let user = next_account_info(accounts_iter)?;
    let nft_token_account = next_account_info(accounts_iter)?;
    let nft_mint = next_account_info(accounts_iter)?;
    let stake_account = next_account_info(accounts_iter)?;
    let token_program = next_account_info(accounts_iter)?;

    if !user.is_signer {
        msg!("User must be signer");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify the user's token account still holds the NFT
    // Check owner, mint, and balance = 1
    validate_token_account(nft_token_account, user.key, nft_mint.key, token_program, true)?;

    // Verify stake account PDA matches
    let (stake_account_pda, _bump_seed) = find_stake_account_address(
        nft_mint.key,
        user.key,
        program_id,
    );
    if stake_account_pda != *stake_account.key {
        msg!("Stake account address does not match the derived PDA");
        return Err(StakingError::InvalidPDA.into());
    }

    // Verify stake account belongs to this user and NFT
    // Use unpack here as we need the data if valid
    let stake_data = StakeAccount::unpack(&stake_account.data.borrow())?;
    if !stake_data.is_initialized {
        msg!("Stake account is not initialized");
        return Err(StakingError::NotInitialized.into());
    }
    if stake_data.owner != *user.key || stake_data.nft_mint != *nft_mint.key {
        msg!("Stake account data does not match user or NFT mint");
        return Err(StakingError::InvalidOwner.into());
    }

    // REMOVED program authority PDA derivation
    // REMOVED program's NFT token account validation
    // REMOVED NFT Transfer back to user instruction

    // Close stake account and return lamports to user
    msg!("Closing stake account and returning lamports");
    let stake_lamports = stake_account.lamports();
    **stake_account.try_borrow_mut_lamports()? = 0; // Drain the account

    let mut user_lamports = user.try_borrow_mut_lamports()?;
    **user_lamports = user_lamports
        .checked_add(stake_lamports)
        .ok_or(StakingError::LamportTransferOverflow)?; // Use custom error

    // Explicitly mark account as closed/uninitialized by zeroing data
    // The runtime garbage collector will eventually reclaim the zeroed account
    let mut stake_data_mut = stake_account.data.borrow_mut();
    stake_data_mut.fill(0);
    msg!("Stake account zeroed");

    msg!("NFT Unstaked (Non-Transfer) Successfully!");
    Ok(())
}

// Claim rewards
fn claim_rewards(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    msg!("Instruction: Claim Rewards (Non-Transfer)");
    let accounts_iter = &mut accounts.iter();

    // Get accounts
    let user = next_account_info(accounts_iter)?;
    let nft_token_account = next_account_info(accounts_iter)?;
    let nft_mint = next_account_info(accounts_iter)?;
    let stake_account = next_account_info(accounts_iter)?;
    let user_reward_account = next_account_info(accounts_iter)?;
    let treasury_account = next_account_info(accounts_iter)?;
    let reward_token_mint = next_account_info(accounts_iter)?;
    let token_program = next_account_info(accounts_iter)?;
    let program_authority = next_account_info(accounts_iter)?;
    let clock_info = next_account_info(accounts_iter)?;

    if !user.is_signer {
        msg!("User must be signer");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify stake account PDA matches
    let (stake_account_pda, _bump_seed) = find_stake_account_address(
        nft_mint.key,
        user.key,
        program_id,
    );
    if stake_account_pda != *stake_account.key {
        msg!("Stake account address does not match the derived PDA");
        return Err(StakingError::InvalidPDA.into());
    }

    // Verify stake account belongs to this user and NFT
    let mut stake_data = StakeAccount::unpack(&stake_account.data.borrow())?;
    if !stake_data.is_initialized {
        msg!("Stake account is not initialized");
        return Err(StakingError::NotInitialized.into());
    }
    if stake_data.owner != *user.key || stake_data.nft_mint != *nft_mint.key {
        msg!("Stake account data does not match user or NFT mint");
        return Err(StakingError::InvalidOwner.into());
    }

    // Verify user still owns the NFT
    msg!("Verifying user still owns the NFT...");
    validate_token_account(nft_token_account, user.key, nft_mint.key, token_program, true)?;
    msg!("User NFT ownership verified.");

    // Verify the user reward account belongs to the user and matches the reward token mint
    validate_token_account(user_reward_account, user.key, reward_token_mint.key, token_program, false)?;

    // Get program authority PDA for signing
    let (authority_pda, authority_bump) = find_program_authority(program_id);
    if authority_pda != *program_authority.key {
        msg!("Invalid program authority PDA provided");
        return Err(StakingError::InvalidPDA.into());
    }

    // Verify the treasury account belongs to the authority and matches the reward token mint
    validate_token_account(treasury_account, &authority_pda, reward_token_mint.key, token_program, false)?;

    // Calculate rewards
    let clock = Clock::from_account_info(clock_info)?;
    let current_time = clock.unix_timestamp;
    let last_claim_time = stake_data.last_claim_time;

    // TODO: Make reward rate configurable (e.g., read from another account)
    const SECONDS_PER_DAY: i64 = 86400; // 24 * 60 * 60
    const REWARD_RATE_PER_DAY: u64 = 250 * 10u64.pow(9); // 250 tokens per day (assuming 9 decimals)

    if current_time <= last_claim_time {
        msg!("No time elapsed since last claim, no rewards to claim.");
        return Ok(()); // Not an error, just no rewards yet
    }

    let time_staked = current_time.checked_sub(last_claim_time)
        .ok_or(StakingError::ArithmeticOverflow)?; // Should not happen

    // Calculate reward amount based on time staked
    // Using u128 for intermediate calculation to prevent overflow
    let reward_amount_u128 = (time_staked as u128)
        .checked_mul(REWARD_RATE_PER_DAY as u128)
        .ok_or(StakingError::ArithmeticOverflow)?
        .checked_div(SECONDS_PER_DAY as u128)
        .ok_or(StakingError::ArithmeticOverflow)?; // Avoid division by zero, though SECONDS_PER_DAY is constant
        
    let reward_amount: u64 = reward_amount_u128
        .try_into() // Remove explicit type <u64>
        .map_err(|_| StakingError::ArithmeticOverflow)?; // Convert back to u64

    if reward_amount == 0 {
        msg!("Calculated reward amount is zero (duration too short?)");
        // Optionally update last_claim_time even if reward is 0 to prevent tiny claims?
        // stake_data.last_claim_time = current_time;
        // StakeAccount::pack(stake_data, &mut stake_account.data.borrow_mut())?;
        return Ok(());
    }

    // Check if treasury has enough balance
    let treasury_data = treasury_account.try_borrow_data()?;
    let treasury_balance = u64::from_le_bytes(*array_ref![treasury_data, 64, 8]);
    if treasury_balance < reward_amount {
        msg!("Treasury balance insufficient to pay rewards");
        return Err(StakingError::InsufficientFunds.into());
    }

    // Transfer rewards from treasury to user
    msg!("Transferring {} reward tokens from treasury to user", reward_amount);
    invoke_signed(
        &token_instruction::transfer(
            token_program.key,
            treasury_account.key,
            user_reward_account.key,
            &authority_pda,
            &[],
            reward_amount,
        )?,
        &[
            treasury_account.clone(),
            user_reward_account.clone(),
            program_authority.clone(), // Authority needs to be signer
            token_program.clone(),
        ],
        &[&[b"authority", &[authority_bump]]],
    )?;

    // Update last claim time in stake account
    stake_data.last_claim_time = current_time;
    StakeAccount::pack(stake_data, &mut stake_account.data.borrow_mut())?;
    msg!("Last claim time updated");

    msg!("Rewards Claimed Successfully!");
    Ok(())
} 