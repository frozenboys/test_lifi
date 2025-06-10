import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

dotenv.config();

const API_URL = 'https://li.quest/v1';
const LOG_FILE = 'lifi_quotes.log';

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

// Check if connection exists between tokens
async function checkConnection(fromChain, toChain, fromToken, toToken) {
    try {
        const params = new URLSearchParams({
            fromChain,
            toChain,
            fromToken,
            toToken,
            allowSwitchChain: 'true',
            allowDestinationCall: 'true'
        });

        writeToLog('\nChecking Li.Fi connection...');
        const response = await fetch(`${API_URL}/connections?${params}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Log connection status
        if (data.connections && data.connections.length > 0) {
            const connection = data.connections[0];
            writeToLog('\n✅ Connection found:');
            writeToLog(`From Chain ID: ${connection.fromChainId}`);
            writeToLog(`To Chain ID: ${connection.toChainId}`);
            
            // Log from token details
            if (connection.fromTokens && connection.fromTokens.length > 0) {
                const fromTokenInfo = connection.fromTokens[0];
                writeToLog('\nFrom Token Details:');
                writeToLog(`Symbol: ${fromTokenInfo.symbol}`);
                writeToLog(`Name: ${fromTokenInfo.name}`);
                writeToLog(`Decimals: ${fromTokenInfo.decimals}`);
                writeToLog(`Price USD: ${formatUSD(fromTokenInfo.priceUSD)}`);
            }
            
            // Log to token details
            if (connection.toTokens && connection.toTokens.length > 0) {
                const toTokenInfo = connection.toTokens[0];
                writeToLog('\nTo Token Details:');
                writeToLog(`Symbol: ${toTokenInfo.symbol}`);
                writeToLog(`Name: ${toTokenInfo.name}`);
                writeToLog(`Decimals: ${toTokenInfo.decimals}`);
                writeToLog(`Price USD: ${formatUSD(toTokenInfo.priceUSD)}`);
            }
            
            return true;
        } else {
            writeToLog('\n❌ No connection found between tokens');
            return false;
        }
    } catch (error) {
        writeToLog('\n❌ Error checking connection: ' + error.message);
        return false;
    }
}

// Get a quote for your desired transfer
async function getQuote(fromChain, toChain, fromToken, toToken, fromAmount, fromAddress) {
    try {
        const params = new URLSearchParams({
            fromChain,
            toChain,
            fromToken,
            toToken,
            fromAmount,
            fromAddress,
        });

        writeToLog('\nRequesting quote from Li.Fi...');
        const response = await fetch(`${API_URL}/quote?${params}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        writeToLog('\n❌ Error fetching quote: ' + error.message);
        writeToLog('\nFailed Quote Parameters:');
        writeToLog(`From Chain: ${fromChain}`);
        writeToLog(`To Chain: ${toChain}`);
        writeToLog(`From Token: ${fromToken}`);
        writeToLog(`To Token: ${toToken}`);
        writeToLog(`Amount: ${fromAmount}`);
        throw error;
    }
}

// Log quote details
function logQuoteDetails(quote) {
    const logLines = [
        '\n=== Li.Fi Quote Details ===',
        
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
        
        '\nTransaction Request Details:',
        `Has serializedTransaction: ${!!quote.transactionRequest?.serializedTransaction}`,
        `Has instructions: ${!!quote.transactionRequest?.instructions}`,
        `Number of instructions: ${quote.transactionRequest?.instructions?.length || 0}`,
        '\n' + '='.repeat(50) + '\n'
    );

    logLines.forEach(line => writeToLog(line));
}

async function run() {
    try {
        const params = {
            fromChain: 'sol',
            toChain: 'sol',
            fromToken: 'So11111111111111111111111111111111111111112',
            toToken: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
            fromAmount: '10000000',
            fromAddress: wallet.publicKey.toString()
        };

        writeToLog('Requesting quote with params:');
        writeToLog(JSON.stringify(params, null, 2));

        // Check connection first
        const hasConnection = await checkConnection(
            params.fromChain,
            params.toChain,
            params.fromToken,
            params.toToken
        );

        // Get quote regardless of connection status
        const quote = await getQuote(
            params.fromChain,
            params.toChain,
            params.fromToken,
            params.toToken,
            params.fromAmount,
            params.fromAddress
        );

        logQuoteDetails(quote);

    } catch (error) {
        writeToLog('\n❌ Error in run: ' + error.message);
    }
}

// Create log file if it doesn't exist
if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, 'Li.Fi Quote Logs\n' + '='.repeat(50) + '\n');
}

writeToLog('Testing Li.Fi API quote functionality for Solana...');
run(); 