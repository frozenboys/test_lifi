import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { Connection, PublicKey, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

dotenv.config();

const API_URL = 'https://li.quest/v1';
const LOG_FILE = 'lifi_test_results.log';

// Check if SOL_SECRET is set
if (!process.env.SOL_SECRET) {
    console.error('Error: SOL_SECRET is not set in .env file');
    process.exit(1);
}

// Initialize Solana connection
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// Initialize wallet from private key
let wallet;
try {
    const secretKey = bs58.decode(process.env.SOL_SECRET);
    wallet = Keypair.fromSecretKey(secretKey);
    console.log('Solana wallet initialized with address:', wallet.publicKey.toString());
} catch (error) {
    console.error('Error initializing Solana wallet:', error.message);
    process.exit(1);
}

// Format amount with decimals
function formatAmount(amount, decimals) {
    return (Number(amount) / Math.pow(10, decimals)).toFixed(decimals);
}

// Format USD amount
function formatUSD(amount) {
    return `$${Number(amount).toFixed(2)}`;
}

// Write to log file
function writeToLog(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    
    // Also log to console
    console.log(message);
    
    // Append to log file
    fs.appendFileSync(LOG_FILE, logMessage);
}

// Get a quote for your desired transfer
async function getQuote(fromChain, toChain, fromToken, toToken, amount, fromAddress, toAddress) {
    writeToLog('\nRequesting quote from Li.Fi...');
    
    const url = 'https://li.quest/v1/quote';
    const params = new URLSearchParams({
        fromChain,
        toChain,
        fromToken,
        toToken,
        fromAmount: amount,
        fromAddress,
        toAddress,
        allowBridges: 'all',
        allowExchanges: 'all',
        order: 'RECOMMENDED'
    });

    const response = await fetch(`${url}?${params.toString()}`);
    
    if (!response.ok) {
        const errorText = await response.text();
        const errorDetails = JSON.parse(errorText);
        
        // Handle specific error cases
        if (errorDetails.code === 1003) {
            writeToLog('\n⚠️ Token not supported by Li.Fi');
            writeToLog('Please verify if the token is supported and the address is correct');
        } else if (errorDetails.code === 1011) {
            writeToLog('\n⚠️ Invalid address format for target chain');
            writeToLog('Please provide a valid address for the target chain');
        }
        
        throw new Error(`HTTP error! status: ${response.status}\nDetails: ${errorText}`);
    }
    
    return await response.json();
}

// Log quote details
function logQuoteDetails(quote, scenario) {
    const logLines = [
        `\n=== Li.Fi Quote Details for ${scenario} ===`,
        
        '\n1. Pre-Execution Quote:',
        `From: ${formatAmount(quote.action.fromAmount, quote.action.fromToken.decimals)} ${quote.action.fromToken.symbol}`,
        `To: ${formatAmount(quote.estimate.toAmount, quote.action.toToken.decimals)} ${quote.action.toToken.symbol}`,
        `Rate: 1 ${quote.action.fromToken.symbol} = ${(Number(quote.estimate.toAmount) / Number(quote.action.fromAmount) * Math.pow(10, quote.action.fromToken.decimals - quote.action.toToken.decimals)).toFixed(6)} ${quote.action.toToken.symbol}`,
        
        '\nUSD Values:',
        `From: ${formatUSD(quote.estimate.fromAmountUSD)}`,
        `To: ${formatUSD(quote.estimate.toAmountUSD)}`,
        
        '\n2. Estimated Fees:'
    ];

    if (quote.estimate.gasCosts && quote.estimate.gasCosts.length > 0) {
        quote.estimate.gasCosts.forEach(cost => {
            logLines.push(`Gas: ${formatAmount(cost.amount, cost.token.decimals)} ${cost.token.symbol} (${formatUSD(cost.amountUSD)})`);
        });
    }
    
    if (quote.estimate.feeCosts && quote.estimate.feeCosts.length > 0) {
        quote.estimate.feeCosts.forEach(cost => {
            logLines.push(`Fee: ${formatAmount(cost.amount, cost.token.decimals)} ${cost.token.symbol} (${formatUSD(cost.amountUSD)})`);
        });
    }
    
    logLines.push(
        '\nSwap Details:',
        `DEX: ${quote.toolDetails.name}`,
        `Slippage: ${(quote.action.slippage * 100).toFixed(2)}%`,
        `Minimum Received: ${formatAmount(quote.estimate.toAmountMin, quote.action.toToken.decimals)} ${quote.action.toToken.symbol}`,
        '\n' + '='.repeat(50) + '\n'
    );

    logLines.forEach(line => writeToLog(line));
}

// Test scenarios
const testScenarios = [
    {
        name: "SOL to Farcion",
        fromToken: 'So11111111111111111111111111111111111111112', // SOL
        toToken: '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', // Farcion
        amount: '10000000', // 0.01 SOL
        fromChain: 'sol',
        toChain: 'sol',
        fromAddress: wallet.publicKey.toString(),
        toAddress: wallet.publicKey.toString()
    },
    {
        name: "Farcion to ETH",
        fromToken: '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', // Farcion
        toToken: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // ETH
        amount: '1000000', // 1 Farcion (6 decimals)
        fromChain: 'sol',
        toChain: 'eth',
        fromAddress: wallet.publicKey.toString(),
        toAddress: '0x77b13aE271BADdBf498ff7b9B98c07377ed2fcbB'
    },
    {
        name: "Farcion to USDT(ETH)",
        fromToken: '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', // Farcion
        toToken: '0xdac17f958d2ee523a2206206994597c13d831ec7', // USDT on Ethereum
        amount: '1000000', // 1 Farcion (6 decimals)
        fromChain: 'sol',
        toChain: 'eth',
        fromAddress: wallet.publicKey.toString(),
        toAddress: '0x77b13aE271BADdBf498ff7b9B98c07377ed2fcbB'
    }
];

async function runTests() {
    // Create log file if it doesn't exist
    if (!fs.existsSync(LOG_FILE)) {
        fs.writeFileSync(LOG_FILE, 'Li.Fi Test Results\n' + '='.repeat(50) + '\n');
    }

    writeToLog('Starting Li.Fi API tests...');
    
    for (const scenario of testScenarios) {
        try {
            writeToLog(`\nTesting scenario: ${scenario.name}`);
            
            const quote = await getQuote(
                scenario.fromChain || 'sol',
                scenario.toChain || 'sol',
                scenario.fromToken,
                scenario.toToken,
                scenario.amount,
                scenario.fromAddress || wallet.publicKey.toString(),
                scenario.toAddress || wallet.publicKey.toString()
            );
            
            logQuoteDetails(quote, scenario.name);
            
            // Add a delay between tests to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000));
            
        } catch (error) {
            writeToLog(`\n❌ Failed to test scenario: ${scenario.name}`);
            writeToLog(`Error: ${error.message}`);
            writeToLog('\nFailed Quote Parameters:');
            writeToLog(`From Chain: ${scenario.fromChain || 'sol'}`);
            writeToLog(`To Chain: ${scenario.toChain || 'sol'}`);
            writeToLog(`From Token: ${scenario.fromToken}`);
            writeToLog(`To Token: ${scenario.toToken}`);
            writeToLog(`Amount: ${scenario.amount}`);
            writeToLog(`From Address: ${scenario.fromAddress || wallet.publicKey.toString()}`);
            writeToLog(`To Address: ${scenario.toAddress || wallet.publicKey.toString()}`);
        }
    }
    
    writeToLog('\nTest suite completed!');
}

runTests(); 