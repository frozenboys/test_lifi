import { Connection, PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'transaction_analysis.log');
const TRANSACTION_SIGNATURE = '35e3kTwQTxHCRsWMNvqcuUcFwYLz9Y5aom2Wc3E4Az15JBDwEaUgdiDHoCML5rpSgqYrKN9Szb3xPWf4m1rhV7Cr';
const SHYFT_API_KEY = 'u6P5bNXM2d36kjU3';

// Write to log file
function writeToLog(message) {
    try {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}\n`;
        
        // Also log to console
        console.log(message);
        
        // Ensure directory exists
        const logDir = path.dirname(LOG_FILE);
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        // Append to log file
        fs.appendFileSync(LOG_FILE, logMessage);
    } catch (error) {
        console.error('Error writing to log file:', error);
    }
}

// Format amount with decimals
function formatAmount(amount, decimals) {
    return (Number(amount) / Math.pow(10, decimals)).toFixed(decimals);
}

async function getTransactionInfo(signature) {
    try {
        writeToLog(`\nAnalyzing swap transaction: ${signature}`);
        
        // Get transaction details from Shyft API
        const shyftResponse = await fetch(
            `https://api.shyft.to/sol/v1/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`,
            {
                method: 'GET',
                headers: {
                    'x-api-key': SHYFT_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (!shyftResponse.ok) {
            const errorText = await shyftResponse.text();
            throw new Error(`Shyft API error: ${shyftResponse.status} - ${errorText}`);
        }

        const data = await shyftResponse.json();
        
        if (!data.success) {
            throw new Error(`Shyft API error: ${data.message || 'Unknown error'}`);
        }

        const result = data.result;

        // Log basic transaction info
        writeToLog('\n=== Swap Transaction Details ===');
        writeToLog(`Time: ${new Date(result.timestamp).toISOString()}`);
        writeToLog(`Status: ${result.status}`);
        writeToLog(`Network Fee: ${result.fee} SOL`);

        // Find swap action
        const swapAction = result.actions?.find(action => action.type === 'SWAP');
        if (swapAction) {
            const { info } = swapAction;
            writeToLog('\nSwap Details:');
            writeToLog(`Swapper: ${info.swapper}`);
            writeToLog(`Slippage: ${info.slippage_in_percent}%`);
            writeToLog(`Quoted Output Amount: ${info.quoted_out_amount}`);
            writeToLog(`Slippage Paid: ${info.slippage_paid}`);

            // Parse token transfers to get input/output amounts
            const inputTransfer = result.actions.find(action => 
                action.type === 'TOKEN_TRANSFER' && 
                action.info.sender === info.swapper
            );
            const outputTransfer = result.actions.find(action => 
                action.type === 'TOKEN_TRANSFER' && 
                action.info.receiver === info.swapper
            );

            if (inputTransfer && outputTransfer) {
                writeToLog('\nToken Transfers:');
                writeToLog(`Input: ${inputTransfer.info.amount} ${inputTransfer.info.token_address}`);
                writeToLog(`Output: ${outputTransfer.info.amount} ${outputTransfer.info.token_address}`);
                
                // Calculate and log rate
                const rate = outputTransfer.info.amount / inputTransfer.info.amount;
                writeToLog(`Rate: 1 ${inputTransfer.info.token_address} = ${rate.toFixed(6)} ${outputTransfer.info.token_address}`);
            }
        } else {
            writeToLog('\nNo swap action found in transaction');
        }

        // Log transaction links
        writeToLog('\nTransaction Links:');
        writeToLog(`Solscan: https://solscan.io/tx/${signature}`);
        writeToLog(`Explorer: https://explorer.solana.com/tx/${signature}`);

    } catch (error) {
        writeToLog(`\n❌ Error analyzing transaction: ${error.message}`);
        console.error('Full error:', error);
    }
}

// Initialize log file
try {
    // Create log file with header if it doesn't exist
    if (!fs.existsSync(LOG_FILE)) {
        const header = 'Swap Transaction Analysis\n' + '='.repeat(50) + '\n';
        fs.writeFileSync(LOG_FILE, header);
        console.log(`Created log file at: ${LOG_FILE}`);
    }
} catch (error) {
    console.error('Error initializing log file:', error);
}

writeToLog('Starting transaction analysis...');
getTransactionInfo(TRANSACTION_SIGNATURE); 