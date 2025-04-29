use solana_program::{
    program_error::ProgramError,
    pubkey::Pubkey,
};
use std::convert::TryInto;

#[derive(Clone, Debug, PartialEq)]
pub enum StakingInstruction {
    /// Stake an NFT
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The owner of the NFT
    /// 1. `[writable]` The owner's NFT token account
    /// 2. `[]` The NFT mint address
    /// 3. `[writable]` The stake account (PDA)
    /// 4. `[]` SPL Token program
    /// 5. `[writable]` PDA token account to hold the NFT
    /// 6. `[]` Rent sysvar
    /// 7. `[]` System program
    /// 8. `[]` Clock sysvar
    StakeNft,

    /// Unstake an NFT and return it to the owner
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The owner of the NFT
    /// 1. `[writable]` The owner's NFT token account to receive the unstaked NFT
    /// 2. `[]` The NFT mint address
    /// 3. `[writable]` The stake account (PDA)
    /// 4. `[writable]` PDA token account holding the NFT
    /// 5. `[]` SPL Token program
    /// 6. `[]` Clock sysvar
    UnstakeNft,

    /// Claim rewards for a staked NFT
    /// 
    /// Accounts expected:
    /// 0. `[signer]` The owner of the NFT
    /// 1. `[]` The NFT mint address
    /// 2. `[writable]` The stake account (PDA)
    /// 3. `[]` Reward token mint
    /// 4. `[writable]` User's reward token account
    /// 5. `[writable]` Treasury account holding reward tokens
    /// 6. `[]` SPL Token program
    /// 7. `[]` Clock sysvar
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