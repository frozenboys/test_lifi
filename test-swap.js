import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { Connection, PublicKey, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

dotenv.config();

const API_URL = 'https://li.quest/v1';
const SHYFT_API_URL = 'https://api.shyft.to/sol/v1';
const LOG_FILE = path.join(process.cwd(), 'swap_analysis.log');
const SHYFT_API_KEY = 'u6P5bNXM2d36kjU3';

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

// Check if LI_FI_API is set
if (!process.env.LI_FI_API) {
    console.error('Error: LI_FI_API is not set in .env file');
    process.exit(1);
}

// Initialize Solana connection
const connection = new Connection('https://api.mainnet-beta.solana.com', {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000
});

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

// Format amount to smallest unit
function formatAmountToSmallestUnit(amount) {
    // Remove any leading zeros
    amount = amount.replace(/^0+/, '');
    
    // If amount is empty after removing leading zeros, return '0'
    if (!amount) return '0';
    
    return amount;
}

// Validate Solana address
function isValidSolanaAddress(address) {
    try {
        new PublicKey(address);
        return true;
    } catch {
        return false;
    }
}

// Validate Ethereum address
function isValidEthereumAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
}

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

// Add separator between swap requests
function addSwapSeparator() {
    const separator = [
        '\n' + '='.repeat(100),
        '🔄 NEW SWAP REQUEST 🔄',
        '='.repeat(100) + '\n'
    ].join('\n');
    writeToLog(separator);
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

        writeToLog('\n=== Checking Li.Fi Connection ===');
        const response = await fetch(`${API_URL}/connections?${params}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'x-api-key': process.env.LI_FI_API
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            const errorDetails = JSON.parse(errorText);
            
            if (response.status === 429) {
                writeToLog('\n⚠️ Rate limit exceeded');
                writeToLog('Please wait a moment before trying again');
            }
            
            throw new Error(`HTTP error! status: ${response.status}\nDetails: ${errorText}`);
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

// Add connection health check
async function checkConnectionHealth() {
    try {
        await connection.getVersion();
        writeToLog('✅ Solana connection is healthy');
        return true;
    } catch (error) {
        writeToLog('❌ Solana connection error: ' + error.message);
        return false;
    }
}

// Get a quote for your desired transfer
async function getQuote(fromChain, toChain, fromToken, toToken, fromAmount, fromAddress, toAddress) {
    try {
        const params = new URLSearchParams({
            fromChain,
            toChain,
            fromToken,
            toToken,
            fromAmount,
            fromAddress,
            toAddress,
            allowBridges: 'all', // Prefer direct bridges
            allowExchanges: 'all',
            order: 'RECOMMENDED',
            preferDirectBridges: 'true' // Prefer direct bridges over multi-step
        });

        writeToLog('\n=== Requesting Li.Fi Quote ===');
        writeToLog('Using direct bridge preference');
        
        const response = await fetch(`${API_URL}/quote?${params}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'x-api-key': process.env.LI_FI_API
            }
        });

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
            } else if (errorDetails.code === 1002) {
                writeToLog('\n⚠️ No available quotes');
                if (errorDetails.errors?.filteredOut) {
                    writeToLog('\nFiltered out paths:');
                    errorDetails.errors.filteredOut.forEach(path => {
                        writeToLog(`- ${path.reason}`);
                    });
                }
                if (errorDetails.errors?.failed) {
                    writeToLog('\nFailed paths:');
                    errorDetails.errors.failed.forEach(path => {
                        Object.values(path.subpaths).forEach(subpaths => {
                            subpaths.forEach(subpath => {
                                writeToLog(`- ${subpath.message}`);
                            });
                        });
                    });
                }
            } else if (response.status === 429) {
                writeToLog('\n⚠️ Rate limit exceeded');
                writeToLog('Please wait a moment before trying again');
            }
            
            throw new Error(`HTTP error! status: ${response.status}\nDetails: ${errorText}`);
        }

        const quote = await response.json();
        logQuoteDetails(quote);
        return quote;
    } catch (error) {
        writeToLog('\n❌ Error fetching quote: ' + error.message);
        writeToLog('\nFailed Quote Parameters:');
        writeToLog(`From Chain: ${fromChain}`);
        writeToLog(`To Chain: ${toChain}`);
        writeToLog(`From Token: ${fromToken}`);
        writeToLog(`To Token: ${toToken}`);
        writeToLog(`Amount: ${fromAmount}`);
        writeToLog(`From Address: ${fromAddress}`);
        writeToLog(`To Address: ${toAddress}`);
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
        '\n' + '='.repeat(50)
    );

    logLines.forEach(line => writeToLog(line));
    return quote; // Return quote for comparison later
}

// Execute the swap transaction
async function executeSwap(quote) {
    try {
        writeToLog('\n=== Executing Swap Transaction ===');
        
        if (!quote.transactionRequest || !quote.transactionRequest.data) {
            writeToLog('\n⚠️ No transaction data in quote response');
            writeToLog('Quote details:');
            writeToLog(JSON.stringify(quote, null, 2));
            throw new Error('No transaction data in quote response');
        }

        // Check connection health before proceeding
        const isHealthy = await checkConnectionHealth();
        if (!isHealthy) {
            throw new Error('Solana connection is not healthy');
        }

        // Get the transaction data
        const transactionData = quote.transactionRequest.data;
        
        // Get recent blockhash with retry logic
        writeToLog('\nGetting recent blockhash...');
        let blockhash;
        let retries = 3;
        
        while (retries > 0) {
            try {
                const response = await connection.getLatestBlockhash();
                blockhash = response.blockhash;
                break;
            } catch (error) {
                retries--;
                if (retries === 0) throw error;
                writeToLog(`Retrying blockhash fetch... (${3 - retries}/3)`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Create versioned transaction from the data
        const transaction = VersionedTransaction.deserialize(Buffer.from(transactionData, 'base64'));
        
        // Sign the transaction
        transaction.sign([wallet]);

        // Send the transaction with retry logic
        writeToLog('\nSending transaction...');
        let signature;
        retries = 3;
        
        while (retries > 0) {
            try {
                signature = await connection.sendRawTransaction(
                    transaction.serialize(),
                    { 
                        skipPreflight: false,
                        maxRetries: 3
                    }
                );
                break;
            } catch (error) {
                retries--;
                if (retries === 0) throw error;
                writeToLog(`Retrying transaction send... (${3 - retries}/3)`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        writeToLog('Transaction sent: ' + signature);

        // Wait for confirmation with increased timeout
        writeToLog('Waiting for transaction confirmation...');
        const confirmation = await connection.confirmTransaction({
            signature,
            blockhash,
            lastValidBlockHeight: (await connection.getBlockHeight()) + 150
        }, 'confirmed');

        if (confirmation.value.err) {
            writeToLog('\n⚠️ Transaction failed with error:');
            writeToLog(JSON.stringify(confirmation.value.err, null, 2));
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        writeToLog('\n✅ Transaction completed successfully!');
        writeToLog('Transaction signature: ' + signature);
        writeToLog('Solscan link: https://solscan.io/tx/' + signature);

        return signature;
    } catch (error) {
        writeToLog('\n❌ Error executing swap: ' + error.message);
        if (error.stack) {
            writeToLog('\nStack trace:');
            writeToLog(error.stack);
        }
        throw error;
    }
}

// Analyze transaction after swap
async function analyzeTransaction(signature, quote) {
    try {
        writeToLog(`\n=== Analyzing Swap Transaction: ${signature} ===`);
        
        // Get transaction details from Shyft API
        const shyftResponse = await fetch(
            `${SHYFT_API_URL}/transaction/parsed?network=mainnet-beta&txn_signature=${signature}`,
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
            writeToLog('\n⚠️ Shyft API error:');
            writeToLog(`Status: ${shyftResponse.status}`);
            writeToLog(`Response: ${errorText}`);
            throw new Error(`Shyft API error: ${shyftResponse.status} - ${errorText}`);
        }

        const data = await shyftResponse.json();
        
        if (!data.success) {
            writeToLog('\n⚠️ Shyft API returned error:');
            writeToLog(JSON.stringify(data, null, 2));
            throw new Error(`Shyft API error: ${data.message || 'Unknown error'}`);
        }

        const result = data.result;

        // Log basic transaction info
        writeToLog('\nTransaction Details:');
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
            writeToLog(`Quoted Output Amount: ${formatAmount(info.quoted_out_amount, quote.action.toToken.decimals)}`);
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
                writeToLog(`Input: ${formatAmount(inputTransfer.info.amount, quote.action.fromToken.decimals)} ${quote.action.fromToken.symbol}`);
                writeToLog(`Output: ${formatAmount(outputTransfer.info.amount, quote.action.toToken.decimals)} ${quote.action.toToken.symbol}`);
                
                // Calculate and log rate using proper decimals
                const inputAmount = Number(inputTransfer.info.amount) / Math.pow(10, quote.action.fromToken.decimals);
                const outputAmount = Number(outputTransfer.info.amount) / Math.pow(10, quote.action.toToken.decimals);
                const rate = outputAmount / inputAmount;
                writeToLog(`Rate: 1 ${quote.action.fromToken.symbol} = ${rate.toFixed(6)} ${quote.action.toToken.symbol}`);

                // Compare quote vs actual
                if (quote) {
                    writeToLog('\n=== Quote vs Actual Comparison ===');
                    writeToLog('\nInput Amount:');
                    writeToLog(`Quote: ${formatAmount(quote.action.fromAmount, quote.action.fromToken.decimals)} ${quote.action.fromToken.symbol}`);
                    writeToLog(`Actual: ${formatAmount(inputTransfer.info.amount, quote.action.fromToken.decimals)} ${quote.action.fromToken.symbol}`);
                    
                    writeToLog('\nOutput Amount:');
                    writeToLog(`Quote: ${formatAmount(quote.estimate.toAmount, quote.action.toToken.decimals)} ${quote.action.toToken.symbol}`);
                    writeToLog(`Actual: ${formatAmount(outputTransfer.info.amount, quote.action.toToken.decimals)} ${quote.action.toToken.symbol}`);
                    
                    // Calculate difference percentage using proper decimals
                    const quoteRate = Number(quote.estimate.toAmount) / Math.pow(10, quote.action.toToken.decimals) / 
                                    (Number(quote.action.fromAmount) / Math.pow(10, quote.action.fromToken.decimals));
                    const actualRate = outputAmount / inputAmount;
                    const rateDiff = ((actualRate - quoteRate) / quoteRate * 100).toFixed(2);
                    
                    writeToLog('\nRate Comparison:');
                    writeToLog(`Quote Rate: 1 ${quote.action.fromToken.symbol} = ${quoteRate.toFixed(6)} ${quote.action.toToken.symbol}`);
                    writeToLog(`Actual Rate: 1 ${quote.action.fromToken.symbol} = ${actualRate.toFixed(6)} ${quote.action.toToken.symbol}`);
                    writeToLog(`Difference: ${rateDiff}%`);
                }
            }
        } else {
            writeToLog('\nNo swap action found in transaction');
        }

        // Log transaction links
        writeToLog('\nTransaction Links:');
        writeToLog(`Solscan: https://solscan.io/tx/${signature}`);
        writeToLog(`Explorer: https://explorer.solana.com/tx/${signature}`);

        // Add transaction delimiter
        writeToLog('\n' + '='.repeat(100));
        writeToLog('='.repeat(100));
        writeToLog('='.repeat(100) + '\n');

    } catch (error) {
        writeToLog(`\n❌ Error analyzing transaction: ${error.message}`);
        if (error.stack) {
            writeToLog('\nStack trace:');
            writeToLog(error.stack);
        }
        console.error('Full error:', error);
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

// Main execution function
async function run() {
    try {
        addSwapSeparator();

        // Get user input for swap parameters
        const fromToken = await askQuestion('Enter from token address (default: SOL): ') || 'So11111111111111111111111111111111111111112';
        const toToken = await askQuestion('Enter to token address (default: USDT): ') || '0xdac17f958d2ee523a2206206994597c13d831ec7';
        
        writeToLog('\nAmount Format Guide:');
        writeToLog('For SOL:');
        writeToLog('1 SOL = 1000000000');
        writeToLog('0.1 SOL = 100000000');
        writeToLog('0.01 SOL = 10000000');
        writeToLog('0.001 SOL = 1000000');
        
        const amountInput = await askQuestion('\nEnter amount in raw format (e.g., 1000000000 for 1 SOL): ') || '10000000';
        const toChain = await askQuestion('Enter target chain (default: eth): ') || 'eth';
        
        // Get appropriate default address based on target chain
        const defaultToAddress = toChain === 'eth' 
            ? '0x77b13aE271BADdBf498ff7b9B98c07377ed2fcbB'  // Ethereum address
            : 'CBKvo4csvk8k2VpwVi13d6xQFEhgMEmJXVFhJeU9GEXj'; // Solana address
            
        const toAddress = await askQuestion(`Enter target address (default: ${defaultToAddress}): `) || defaultToAddress;

        // Validate addresses based on chain
        if (!isValidSolanaAddress(wallet.publicKey.toString())) {
            writeToLog('\n❌ Invalid Solana from address');
            return;
        }

        if (toChain === 'eth' && !isValidEthereumAddress(toAddress)) {
            writeToLog('\n❌ Invalid Ethereum to address');
            writeToLog('Please provide a valid Ethereum address (0x...)');
            return;
        } else if (toChain === 'sol' && !isValidSolanaAddress(toAddress)) {
            writeToLog('\n❌ Invalid Solana to address');
            writeToLog('Please provide a valid Solana address');
            return;
        }

        // Format amount to smallest unit
        const amount = formatAmountToSmallestUnit(amountInput);

        writeToLog('\nAmount Details:');
        writeToLog(`Input: ${amountInput}`);
        writeToLog(`Formatted: ${amount}`);

        // Validate amount is a valid number
        if (isNaN(Number(amount)) || Number(amount) <= 0) {
            writeToLog('\n❌ Invalid amount: Must be a positive number');
            return;
        }

        const params = {
            fromChain: 'sol',
            toChain: toChain,
            fromToken: fromToken,
            toToken: toToken,
            fromAmount: amount,
            fromAddress: wallet.publicKey.toString(),
            toAddress: toAddress
        };

        writeToLog('\n=== Starting Cross-Chain Swap Process ===');
        writeToLog('Swap Parameters:');
        writeToLog(JSON.stringify(params, null, 2));

        // Step 1: Check connection
        const hasConnection = await checkConnection(
            params.fromChain,
            params.toChain,
            params.fromToken,
            params.toToken
        );

        if (!hasConnection) {
            writeToLog('\n⚠️ No connection found between tokens');
            writeToLog('Please verify token addresses and try again');
            return;
        }

        // Step 2: Get quote
        const quote = await getQuote(
            params.fromChain,
            params.toChain,
            params.fromToken,
            params.toToken,
            params.fromAmount,
            params.fromAddress,
            params.toAddress
        );

        // Calculate formatted amounts for display
        const fromAmount = formatAmount(params.fromAmount, quote.action.fromToken.decimals);
        const toAmount = formatAmount(quote.estimate.toAmount, quote.action.toToken.decimals);
        const fromSymbol = quote.action.fromToken.symbol;
        const toSymbol = quote.action.toToken.symbol;

        // Ask for confirmation with detailed information
        const confirmed = await askConfirmation(
            `\n⚠️  WARNING: You are about to perform a cross-chain swap:\n` +
            `From: ${fromAmount} ${fromSymbol} (${params.fromChain})\n` +
            `To: ${toAmount} ${toSymbol} (${params.toChain})\n` +
            `Target Address: ${params.toAddress}\n` +
            `DEX: ${quote.toolDetails.name}\n` +
            `Slippage: ${(quote.action.slippage * 100).toFixed(2)}%\n` +
            `Estimated Fees: ${formatUSD(quote.estimate.feeCosts?.reduce((sum, cost) => sum + cost.amountUSD, 0) || 0)}\n\n` +
            `Do you want to proceed? (yes/no): `
        );

        if (!confirmed) {
            writeToLog('\n❌ Transaction cancelled by user');
            return;
        }

        // Step 3: Execute swap
        const signature = await executeSwap(quote);

        // Step 4: Analyze transaction
        await analyzeTransaction(signature, quote);

        // Add completion separator
        const completionSeparator = [
            '\n' + '='.repeat(100),
            '✅ SWAP COMPLETED ✅',
            '='.repeat(100) + '\n'
        ].join('\n');
        writeToLog(completionSeparator);

    } catch (error) {
        writeToLog('\n❌ Error in run: ' + error.message);
        if (error.stack) {
            writeToLog('\nStack trace:');
            writeToLog(error.stack);
        }
        
        // Add error separator
        const errorSeparator = [
            '\n' + '='.repeat(100),
            '❌ SWAP FAILED ❌',
            '='.repeat(100) + '\n'
        ].join('\n');
        writeToLog(errorSeparator);
    } finally {
        rl.close();
    }
}

// Helper function to ask questions
function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}

// Initialize log file
try {
    // Create log file with header if it doesn't exist
    if (!fs.existsSync(LOG_FILE)) {
        const header = 'Li.Fi Swap Analysis\n' + '='.repeat(50) + '\n';
        fs.writeFileSync(LOG_FILE, header);
        console.log(`Created log file at: ${LOG_FILE}`);
    }
} catch (error) {
    console.error('Error initializing log file:', error);
}

writeToLog('Starting Li.Fi swap process...');
run(); 