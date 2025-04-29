use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program::{invoke, invoke_signed},
    program_error::ProgramError,
    program_pack::{IsInitialized, Pack},
    pubkey::Pubkey,
    sysvar::{rent::Rent, Sysvar, clock::Clock},
    system_instruction,
};
use std::{convert::TryInto, cmp::min};
use thiserror::Error;

// Import our instruction module
mod instruction;
pub use instruction::StakingInstruction;

// Define errors
#[derive(Error, Debug, Clone, PartialEq)]
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

impl StakeAccount {
    pub const LEN: usize = 1 + 32 + 32 + 8 + 8; // is_initialized + owner + nft_mint + stake_time + last_claim_time
}

impl IsInitialized for StakeAccount {
    fn is_initialized(&self) -> bool {
        self.is_initialized
    }
}

impl Pack for StakeAccount {
    const LEN: usize = Self::LEN;

    fn unpack_from_slice(src: &[u8]) -> Result<Self, ProgramError> {
        let is_initialized = src[0] != 0;
        let owner = Pubkey::new(&src[1..33]);
        let nft_mint = Pubkey::new(&src[33..65]);
        let stake_time = i64::from_le_bytes(src[65..73].try_into().unwrap());
        let last_claim_time = i64::from_le_bytes(src[73..81].try_into().unwrap());

        Ok(StakeAccount {
            is_initialized,
            owner,
            nft_mint,
            stake_time,
            last_claim_time,
        })
    }

    fn pack_into_slice(&self, dst: &mut [u8]) {
        dst[0] = self.is_initialized as u8;
        dst[1..33].copy_from_slice(self.owner.as_ref());
        dst[33..65].copy_from_slice(self.nft_mint.as_ref());
        dst[65..73].copy_from_slice(&self.stake_time.to_le_bytes());
        dst[73..81].copy_from_slice(&self.last_claim_time.to_le_bytes());
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
) -> Result<(), ProgramError> {
    // Check if this is a valid token account
    if token_account.owner != token_program.key {
        msg!("Token account not owned by token program");
        return Err(StakingError::InvalidTokenAccount.into());
    }

    // Read token account data to get mint and owner
    let token_account_data = token_account.try_borrow_data()?;
    
    // SPL Token account data structure has mint at bytes 0-32
    let account_mint = Pubkey::new(&token_account_data[..32]);
    if account_mint != *expected_mint {
        msg!("Token account mint does not match expected mint");
        return Err(StakingError::InvalidMint.into());
    }
    
    // Owner is at bytes 32-64
    let account_owner = Pubkey::new(&token_account_data[32..64]);
    if account_owner != *expected_owner {
        msg!("Token account owner does not match expected owner");
        return Err(StakingError::InvalidTokenAccountOwner.into());
    }

    Ok(())
}

// Stake an NFT
fn stake_nft(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();

    // Get accounts
    let user = next_account_info(accounts_iter)?;
    let nft_token_account = next_account_info(accounts_iter)?;
    let nft_mint = next_account_info(accounts_iter)?;
    let stake_account = next_account_info(accounts_iter)?;
    let token_program = next_account_info(accounts_iter)?;
    let pda_token_account = next_account_info(accounts_iter)?;
    let rent_info = next_account_info(accounts_iter)?;
    let system_program = next_account_info(accounts_iter)?;
    let clock_info = next_account_info(accounts_iter)?;

    // Verify account ownership and signatures
    if !user.is_signer {
        msg!("User must be signer");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify the token account belongs to the user and matches the NFT mint
    validate_token_account(nft_token_account, user.key, nft_mint.key, token_program)?;

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

    // Get program authority PDA for signing
    let (authority_pda, authority_bump) = find_program_authority(program_id);

    // Check if program token account belongs to the authority and matches the NFT mint
    validate_token_account(pda_token_account, &authority_pda, nft_mint.key, token_program)?;

    // Create stake account if it doesn't exist
    if stake_account.data_is_empty() {
        let rent = &Rent::from_account_info(rent_info)?;
        let space = StakeAccount::LEN;
        let lamports = rent.minimum_balance(space);

        // Create account with PDA
        invoke_signed(
            &system_instruction::create_account(
                user.key,
                stake_account.key,
                lamports,
                space as u64,
                program_id,
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
    } else {
        // If account exists, make sure it's not already initialized
        let stake_data = StakeAccount::unpack_unchecked(&stake_account.data.borrow())?;
        if stake_data.is_initialized {
            msg!("Stake account is already initialized");
            return Err(StakingError::AlreadyInitialized.into());
        }
    }
    
    // Transfer NFT to program PDA token account
    invoke(
        &spl_token::instruction::transfer(
            token_program.key,
            nft_token_account.key,
            pda_token_account.key,
            user.key,
            &[],
            1,
        )?,
        &[
            nft_token_account.clone(),
            pda_token_account.clone(),
            user.clone(),
            token_program.clone(),
        ],
    )?;

    // Get current time
    let clock = Clock::from_account_info(clock_info)?;
    let current_time = clock.unix_timestamp;

    // Initialize stake account data
    let mut stake_data = StakeAccount::unpack_unchecked(&stake_account.data.borrow())?;
    stake_data.is_initialized = true;
    stake_data.owner = *user.key;
    stake_data.nft_mint = *nft_mint.key;
    stake_data.stake_time = current_time;
    stake_data.last_claim_time = current_time;
    StakeAccount::pack(stake_data, &mut stake_account.data.borrow_mut())?;

    msg!("NFT staked successfully!");
    Ok(())
}

// Unstake an NFT
fn unstake_nft(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();

    // Get accounts
    let user = next_account_info(accounts_iter)?;
    let nft_token_account = next_account_info(accounts_iter)?;
    let nft_mint = next_account_info(accounts_iter)?;
    let stake_account = next_account_info(accounts_iter)?;
    let pda_token_account = next_account_info(accounts_iter)?;
    let token_program = next_account_info(accounts_iter)?;
    let clock_info = next_account_info(accounts_iter)?;

    // Verify account ownership and signatures
    if !user.is_signer {
        msg!("User must be signer");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify the token account belongs to the user and matches the NFT mint
    validate_token_account(nft_token_account, user.key, nft_mint.key, token_program)?;

    // Verify stake account belongs to this user and NFT
    let stake_data = StakeAccount::unpack(&stake_account.data.borrow())?;
    if !stake_data.is_initialized {
        msg!("Stake account is not initialized");
        return Err(StakingError::NotInitialized.into());
    }
    
    if stake_data.owner != *user.key || stake_data.nft_mint != *nft_mint.key {
        msg!("Stake account does not belong to this user or NFT");
        return Err(StakingError::InvalidOwner.into());
    }

    // Get program authority PDA for signing
    let (authority_pda, authority_bump) = find_program_authority(program_id);

    // Check if program token account belongs to the authority and matches the NFT mint
    validate_token_account(pda_token_account, &authority_pda, nft_mint.key, token_program)?;

    // Transfer NFT back to user
    invoke_signed(
        &spl_token::instruction::transfer(
            token_program.key,
            pda_token_account.key,
            nft_token_account.key,
            &authority_pda,
            &[],
            1,
        )?,
        &[
            pda_token_account.clone(),
            nft_token_account.clone(),
            token_program.clone(),
        ],
        &[&[b"authority", &[authority_bump]]],
    )?;

    // Close stake account and return lamports to user
    **user.lamports.borrow_mut() = user.lamports()
        .checked_add(stake_account.lamports())
        .ok_or(ProgramError::ArithmeticOverflow)?;
    **stake_account.lamports.borrow_mut() = 0;

    // Clear out the stake account data
    let mut stake_data = stake_data;
    stake_data.is_initialized = false;
    StakeAccount::pack(stake_data, &mut stake_account.data.borrow_mut())?;

    msg!("NFT unstaked successfully!");
    Ok(())
}

// Claim rewards
fn claim_rewards(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();

    // Get accounts
    let user = next_account_info(accounts_iter)?;
    let nft_mint = next_account_info(accounts_iter)?;
    let stake_account = next_account_info(accounts_iter)?;
    let reward_token_mint = next_account_info(accounts_iter)?;
    let user_reward_account = next_account_info(accounts_iter)?;
    let treasury_account = next_account_info(accounts_iter)?;
    let token_program = next_account_info(accounts_iter)?;
    let clock_info = next_account_info(accounts_iter)?;

    // Verify account ownership and signatures
    if !user.is_signer {
        msg!("User must be signer");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify stake account belongs to this user and NFT
    let mut stake_data = StakeAccount::unpack(&stake_account.data.borrow())?;
    if !stake_data.is_initialized {
        msg!("Stake account is not initialized");
        return Err(StakingError::NotInitialized.into());
    }
    
    if stake_data.owner != *user.key || stake_data.nft_mint != *nft_mint.key {
        msg!("Stake account does not belong to this user or NFT");
        return Err(StakingError::InvalidOwner.into());
    }

    // Verify the user reward account belongs to the user and matches the reward token mint
    validate_token_account(user_reward_account, user.key, reward_token_mint.key, token_program)?;

    // Get program authority PDA for signing
    let (authority_pda, authority_bump) = find_program_authority(program_id);

    // Verify the treasury account belongs to the authority and matches the reward token mint
    validate_token_account(treasury_account, &authority_pda, reward_token_mint.key, token_program)?;

    // Calculate rewards
    let clock = Clock::from_account_info(clock_info)?;
    let current_time = clock.unix_timestamp;
    let seconds_since_last_claim = current_time - stake_data.last_claim_time;
    
    // Convert seconds to days (rounded down)
    let days = seconds_since_last_claim / 86400;
    
    // Calculate rewards: 250 tokens per day
    let reward_per_day = 250;
    let rewards = reward_per_day * days;
    
    // Only process if there are rewards to claim
    if rewards > 0 {
        // Check if treasury has enough tokens
        let treasury_data = treasury_account.try_borrow_data()?;
        // Amount field in a token account is at offset 64 and is a u64
        let treasury_amount = u64::from_le_bytes(treasury_data[64..72].try_into().unwrap());
        
        if treasury_amount < rewards as u64 {
            msg!("Treasury has insufficient funds for full reward payout");
            // If treasury has some funds, pay out what's available
            if treasury_amount > 0 {
                msg!("Paying out partial rewards: {}", treasury_amount);
                
                // Transfer available rewards from treasury to user
                invoke_signed(
                    &spl_token::instruction::transfer(
                        token_program.key,
                        treasury_account.key,
                        user_reward_account.key,
                        &authority_pda,
                        &[],
                        treasury_amount,
                    )?,
                    &[
                        treasury_account.clone(),
                        user_reward_account.clone(),
                        token_program.clone(),
                    ],
                    &[&[b"authority", &[authority_bump]]],
                )?;
                
                // Update last claim time proportionally to what was paid
                let paid_days = (treasury_amount as f64 / reward_per_day as f64).floor() as i64;
                if paid_days > 0 {
                    stake_data.last_claim_time += paid_days * 86400;
                    StakeAccount::pack(stake_data, &mut stake_account.data.borrow_mut())?;
                }
                
                msg!("Claimed {} tokens in rewards (partial payout)", treasury_amount);
                return Ok(());
            } else {
                return Err(StakingError::InsufficientRewards.into());
            }
        }
        
        // Transfer rewards from treasury to user
        invoke_signed(
            &spl_token::instruction::transfer(
                token_program.key,
                treasury_account.key,
                user_reward_account.key,
                &authority_pda,
                &[],
                rewards as u64,
            )?,
            &[
                treasury_account.clone(),
                user_reward_account.clone(),
                token_program.clone(),
            ],
            &[&[b"authority", &[authority_bump]]],
        )?;
        
        // Update last claim time
        stake_data.last_claim_time = current_time;
        StakeAccount::pack(stake_data, &mut stake_account.data.borrow_mut())?;
        
        msg!("Claimed {} tokens in rewards", rewards);
    } else {
        msg!("No rewards available to claim yet");
    }

    Ok(())
} 