#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('=== POOKIE Presale Scripts Setup ===');
console.log('This script will help you set up the necessary environment for the POOKIE presale scripts.');

// Check if necessary directories exist
if (!fs.existsSync('./scripts')) {
  console.log('\nCreating scripts directory...');
  fs.mkdirSync('./scripts', { recursive: true });
}

// Copy fixed scripts to standard names
function copyFixedScripts() {
  console.log('\nSetting up scripts with proper table structure...');
  
  const scripts = [
    { source: 'treasury-functions-fixed.sql', target: 'treasury-functions.sql' },
    { source: 'monitor-treasury-fixed.js', target: 'monitor-treasury.js' },
    { source: 'check-stats-fixed.js', target: 'check-stats.js' },
    { source: 'import-transactions-fixed.js', target: 'import-transactions.js' },
    { source: 'visualize-presale-fixed.js', target: 'visualize-presale.js' }
  ];
  
  for (const script of scripts) {
    if (fs.existsSync(`./scripts/${script.source}`)) {
      try {
        fs.copyFileSync(`./scripts/${script.source}`, `./scripts/${script.target}`);
        console.log(`✅ Copied ${script.source} to ${script.target}`);
      } catch (error) {
        console.error(`❌ Error copying ${script.source}:`, error.message);
      }
    } else {
      console.log(`⚠️ ${script.source} not found, skipping`);
    }
  }
}

// Check if .env.local exists
const envCheck = () => {
  console.log('\nChecking for .env.local file...');
  
  if (!fs.existsSync('./.env.local')) {
    console.log('\n⚠️ .env.local file not found!');
    rl.question('Would you like to create a template .env.local file? (y/n) ', (answer) => {
      if (answer.toLowerCase() === 'y') {
        const envTemplate = `# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Solana Configuration
NEXT_PUBLIC_TREASURY_WALLET=4rYvLKto7HzVESZnXj7RugCyDgjz4uWeHR4MHCy3obNh
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
`;
        fs.writeFileSync('./.env.local', envTemplate);
        console.log('Template .env.local file created. Please edit it with your actual values.');
      }
      copyFixedScripts();
      installDependencies();
    });
  } else {
    console.log('✅ .env.local file found.');
    copyFixedScripts();
    installDependencies();
  }
};

// Install dependencies
const installDependencies = () => {
  console.log('\nChecking required dependencies...');
  
  rl.question('Would you like to install the required dependencies? (y/n) ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      try {
        console.log('\nInstalling dependencies...');
        execSync('npm install @supabase/supabase-js @solana/web3.js dotenv node-schedule', { stdio: 'inherit' });
        console.log('✅ Dependencies installed successfully.');
      } catch (error) {
        console.error('❌ Error installing dependencies:', error.message);
        console.log('Please install the following dependencies manually:');
        console.log('npm install @supabase/supabase-js @solana/web3.js dotenv node-schedule');
      }
    }
    
    sqlInstructions();
  });
};

// Provide SQL installation instructions
const sqlInstructions = () => {
  console.log('\n=== SQL Setup Instructions ===');
  console.log('You need to run the SQL functions in your Supabase project to enable all features.');
  console.log('IMPORTANT: The SQL has been modified to work with your table structure!');
  console.log('1. Go to your Supabase dashboard');
  console.log('2. Navigate to the SQL Editor');
  console.log('3. Copy the contents of scripts/treasury-functions.sql');
  console.log('4. Run the SQL in the editor');
  
  rl.question('\nWould you like to view the SQL file contents now? (y/n) ', (answer) => {
    if (answer.toLowerCase() === 'y') {
      try {
        const sqlContent = fs.readFileSync('./scripts/treasury-functions.sql', 'utf8');
        console.log('\n=== SQL File Contents ===');
        console.log(sqlContent);
      } catch (error) {
        console.error('❌ Error reading SQL file:', error.message);
      }
    }
    
    finishSetup();
  });
};

// Final instructions
const finishSetup = () => {
  console.log('\n=== Setup Complete ===');
  console.log('To use the scripts:');
  console.log('1. Check current presale status:');
  console.log('   node scripts/check-stats.js');
  console.log('2. Import recent transactions:');
  console.log('   node scripts/import-transactions.js');
  console.log('3. Start continuous monitoring:');
  console.log('   node scripts/monitor-treasury.js');
  console.log('4. View presale dashboard:');
  console.log('   node scripts/visualize-presale.js');
  
  const options = [
    { name: 'Check presale stats', cmd: 'node scripts/check-stats.js' },
    { name: 'View presale dashboard', cmd: 'node scripts/visualize-presale.js' },
    { name: 'Exit setup', cmd: null }
  ];
  
  console.log('\nWhat would you like to do next?');
  options.forEach((option, index) => {
    console.log(`${index + 1}. ${option.name}`);
  });
  
  rl.question('\nEnter option number: ', (answer) => {
    const option = parseInt(answer) - 1;
    
    if (option >= 0 && option < options.length && options[option].cmd) {
      try {
        console.log(`\nRunning ${options[option].name}...`);
        execSync(options[option].cmd, { stdio: 'inherit' });
      } catch (error) {
        console.error(`❌ Error running ${options[option].name}:`, error.message);
      }
    }
    
    console.log('\nSetup wizard completed. Thank you for using POOKIE Presale Scripts!');
    rl.close();
  });
};

// Start the setup process
envCheck();

// Handle process exit
rl.on('close', () => {
  console.log('\nSetup wizard closed. Thank you for using POOKIE Presale Scripts!');
  process.exit(0);
}); 