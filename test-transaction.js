import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { Connection, PublicKey, Keypair, Transaction, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

dotenv.config();

const API_URL = 'https://li.quest/v1';
const LOG_FILE = 'lifi_swaps.log';

// Create readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

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

    // Add gas costs
    if (quote.estimate.gasCosts && quote.estimate.gasCosts.length > 0) {
        quote.estimate.gasCosts.forEach(cost => {
            logLines.push(`Gas: ${formatAmount(cost.amount, cost.token.decimals)} ${cost.token.symbol} (${formatUSD(cost.amountUSD)})`);
        });
    }
    
    // Add fee costs
    if (quote.estimate.feeCosts && quote.estimate.feeCosts.length > 0) {
        quote.estimate.feeCosts.forEach(cost => {
            logLines.push(`Fee: ${formatAmount(cost.amount, cost.token.decimals)} ${cost.token.symbol} (${formatUSD(cost.amountUSD)})`);
        });
    }
    
    // Add swap details
    logLines.push(
        '\nSwap Details:',
        `DEX: ${quote.toolDetails.name}`,
        `Slippage: ${(quote.action.slippage * 100).toFixed(2)}%`,
        `Minimum Received: ${formatAmount(quote.estimate.toAmountMin, quote.action.toToken.decimals)} ${quote.action.toToken.symbol}`,
        
        '\n3. Post-Execution Results:',
        'Final Amount Received: [Will be filled after transaction]',
        'Actual Fees Paid: [Will be filled after transaction]',
        
        '\n4. Transaction Links:',
        'Solscan: [Will be filled after transaction]',
        '\n' + '='.repeat(50) + '\n'
    );

    // Write all lines to log
    logLines.forEach(line => writeToLog(line));
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

        const quote = await response.json();
        logQuoteDetails(quote);
        return quote;
    } catch (error) {
        const errorLines = [
            '\n❌ Error fetching quote: ' + error.message,
            '\nFailed Quote Parameters:',
            `From Chain: ${fromChain}`,
            `To Chain: ${toChain}`,
            `From Token: ${fromToken}`,
            `To Token: ${toToken}`,
            `Amount: ${fromAmount}`,
            '\n' + '='.repeat(50) + '\n'
        ];
        
        errorLines.forEach(line => writeToLog(line));
        throw error;
    }
}

// Check wallet balance
async function checkWalletBalance() {
    try {
        const balance = await connection.getBalance(wallet.publicKey);
        writeToLog(`\nCurrent wallet balance: ${formatAmount(balance, 9)} SOL`);
        return balance;
    } catch (error) {
        writeToLog(`\n❌ Error checking balance: ${error.message}`);
        throw error;
    }
}

// Verify transaction data
function verifyTransactionData(transactionData) {
    if (!transactionData) {
        throw new Error('No transaction data provided');
    }
    
    try {
        const transaction = VersionedTransaction.deserialize(Buffer.from(transactionData, 'base64'));
        if (!transaction) {
            throw new Error('Failed to deserialize transaction');
        }
        return true;
    } catch (error) {
        throw new Error(`Invalid transaction data: ${error.message}`);
    }
}

// Ask for user confirmation
function askConfirmation(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
        });
    });
}

async function run() {
    try {
        // Check wallet balance first
        const balance = await checkWalletBalance();
        const amountToSwap = 10000000; // 0.01 SOL
        
        if (balance < amountToSwap) {
            throw new Error(`Insufficient balance. Required: ${formatAmount(amountToSwap, 9)} SOL, Available: ${formatAmount(balance, 9)} SOL`);
        }

        const params = {
            fromChain: 'sol',
            toChain: 'sol',
            fromToken: 'So11111111111111111111111111111111111111112',
            toToken: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
            fromAmount: amountToSwap.toString(),
            fromAddress: wallet.publicKey.toString()
        };

        // Get quote
        const quote = await getQuote(
            params.fromChain,
            params.toChain,
            params.fromToken,
            params.toToken,
            params.fromAmount,
            params.fromAddress
        );

        if (!quote.transactionRequest || !quote.transactionRequest.data) {
            throw new Error('No transaction data in quote response');
        }

        // Verify transaction data
        verifyTransactionData(quote.transactionRequest.data);

        // Ask for confirmation
        const confirmed = await askConfirmation(
            `\n⚠️  WARNING: You are about to swap ${formatAmount(amountToSwap, 9)} SOL to USDT.\n` +
            `Estimated to receive: ${formatAmount(quote.estimate.toAmount, quote.action.toToken.decimals)} USDT\n` +
            `DEX: ${quote.toolDetails.name}\n` +
            `Slippage: ${(quote.action.slippage * 100).toFixed(2)}%\n\n` +
            `Do you want to proceed? (yes/no): `
        );

        if (!confirmed) {
            writeToLog('\nTransaction cancelled by user');
            return;
        }

        // Get the transaction data
        const transactionData = quote.transactionRequest.data;
        
        // Get recent blockhash
        writeToLog('\nGetting recent blockhash...');
        const { blockhash } = await connection.getLatestBlockhash();

        // Create versioned transaction from the data
        const transaction = VersionedTransaction.deserialize(Buffer.from(transactionData, 'base64'));
        
        // Sign the transaction
        transaction.sign([wallet]);

        // Send the transaction
        writeToLog('\nSending transaction...');
        const signature = await connection.sendRawTransaction(
            transaction.serialize(),
            { skipPreflight: false }
        );

        writeToLog('Transaction sent: ' + signature);

        // Wait for confirmation
        writeToLog('Waiting for transaction confirmation...');
        const confirmation = await connection.confirmTransaction(signature);

        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err}`);
        }

        writeToLog('\n✅ Transaction completed successfully!');
        writeToLog('Transaction signature: ' + signature);
        writeToLog('Solscan link: https://solscan.io/tx/' + signature);

    } catch (error) {
        writeToLog('\n❌ Error in run: ' + error.message);
    } finally {
        rl.close();
    }
}

// Create log file if it doesn't exist
if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(LOG_FILE, 'Li.Fi Swap Logs\n' + '='.repeat(50) + '\n');
}

writeToLog('Testing Li.Fi API functionality for Solana...');
run(); 