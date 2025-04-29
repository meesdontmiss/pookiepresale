const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: '.env.local' });

console.log('🚀 Deploying Pookie NFT Staking Program...');

// Path to the program
const PROGRAM_PATH = path.join(__dirname, '../programs/pookie-nft-staking');

// Function to run a command and return a promise
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { 
      stdio: 'inherit',
      shell: true,
      ...options
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

// Build and deploy the program
async function buildAndDeploy() {
  try {
    // Check if Solana is installed
    console.log('Checking Solana CLI installation...');
    try {
      await runCommand('solana', ['--version']);
    } catch (error) {
      console.error('❌ Solana CLI not found. Please install it: https://docs.solana.com/cli/install-solana-cli-tools');
      process.exit(1);
    }

    // Check if program directory exists
    if (!fs.existsSync(PROGRAM_PATH)) {
      console.error(`❌ Program directory not found at ${PROGRAM_PATH}`);
      process.exit(1);
    }

    // Change to program directory
    process.chdir(PROGRAM_PATH);
    
    // Build the program
    console.log('Building the program...');
    await runCommand('cargo', ['build-bpf']);
    
    // Deploy the program
    console.log('Deploying the program...');
    const result = await runCommand('solana', ['program', 'deploy', '--keypair', '~/.config/solana/id.json', './target/deploy/pookie_nft_staking.so']);
    
    // Extract program ID from the deployment output
    // Note: This will need to be manually extracted as the output goes to stdout
    console.log('✅ Program deployed successfully!');
    console.log('\nIMPORTANT: Add the program ID to your .env.local file:');
    console.log('NEXT_PUBLIC_STAKING_PROGRAM_ID=your-new-program-id\n');
    console.log('Also make sure to set:');
    console.log('NEXT_PUBLIC_POOKIE_TOKEN_MINT=your-token-mint-address');
    console.log('NEXT_PUBLIC_TREASURY_ADDRESS=your-treasury-address\n');
    
  } catch (error) {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  }
}

// Run the deployment
buildAndDeploy(); 