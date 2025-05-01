use solana_program::{
    program_error::ProgramError,
    pubkey::Pubkey,
};

#[derive(Clone, Debug, PartialEq)]
pub enum StakingInstruction {
    /// Stake an NFT (Non-Transfer Model)
    /// 
    /// Accounts expected:
    /// 0. `[signer, writable]` The owner of the NFT (payer for PDA creation)
    /// 1. `[]` The owner's NFT token account (checked for ownership)
    /// 2. `[]` The NFT mint address
    /// 3. `[writable]` The stake account (PDA, created if needed)
    /// 4. `[]` SPL Token program
    /// 5. `[]` Rent sysvar
    /// 6. `[]` System program
    /// 7. `[]` Clock sysvar
    StakeNft,

    /// Unstake an NFT (Non-Transfer Model)
    /// 
    /// Accounts expected:
    /// 0. `[signer, writable]` The owner of the NFT (receives lamports from closed PDA)
    /// 1. `[]` The owner's NFT token account (checked for ownership)
    /// 2. `[]` The NFT mint address
    /// 3. `[writable]` The stake account (PDA, closed)
    /// 4. `[]` SPL Token program
    UnstakeNft,

    /// Claim rewards for a staked NFT (Non-Transfer Model)
    /// 
    /// Accounts expected:
    /// 0. `[signer, writable]` The owner of the NFT
    /// 1. `[]` The owner's NFT token account (checked for ownership)
    /// 2. `[]` The NFT mint address
    /// 3. `[writable]` The stake account (PDA, updated last_claim_time)
    /// 4. `[writable]` User's reward token account
    /// 5. `[writable]` Treasury account holding reward tokens
    /// 6. `[]` Reward token mint
    /// 7. `[]` SPL Token program
    /// 8. `[]` Program Authority (PDA, "authority")
    /// 9. `[]` Clock sysvar
    ClaimRewards,
}

impl StakingInstruction {
    /// Unpacks a byte buffer into a StakingInstruction
    pub fn unpack(input: &[u8]) -> Result<Self, ProgramError> {
        let (tag, _rest) = input.split_first().ok_or(ProgramError::InvalidInstructionData)?;

        Ok(match tag {
            0 => Self::StakeNft,
            1 => Self::UnstakeNft,
            2 => Self::ClaimRewards,
            _ => return Err(ProgramError::InvalidInstructionData),
        })
    }

    /// Packs a StakingInstruction into a byte buffer
    pub fn pack(&self) -> Vec<u8> {
        let mut buf = Vec::with_capacity(1);
        match self {
            Self::StakeNft => buf.push(0),
            Self::UnstakeNft => buf.push(1),
            Self::ClaimRewards => buf.push(2),
        }
        buf
    }
} 