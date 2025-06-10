import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

dotenv.config();

const API_URL = 'https://li.quest/v1';

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
        console.error('Error fetching quote:', error);
        throw error;
    }
}

// Check the status of your transfer
async function getStatus(bridge, fromChain, toChain, txHash) {
    try {
        const params = new URLSearchParams({
            bridge,
            fromChain,
            toChain,
            txHash,
        });

        const response = await fetch(`${API_URL}/status?${params}`, {
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
        console.error('Error checking status:', error);
        throw error;
    }
}

async function run() {
    try {
        const params = {
            fromChain: 1151111081099710, // Solana chain ID
            toChain: 1151111081099710,   // Solana chain ID
            fromToken: 'So11111111111111111111111111111111111111112', // SOL token address
            toToken: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT token address on Solana
            fromAmount: '10000000', // 0.01 SOL (in lamports)
            fromAddress: wallet.publicKey.toString()
        };

        console.log('Requesting quote with params:', params);
        const quote = await getQuote(
            params.fromChain,
            params.toChain,
            params.fromToken,
            params.toToken,
            params.fromAmount,
            params.fromAddress
        );

        console.log('\nQuote result:', JSON.stringify(quote, null, 2));

        // Send the transaction
        console.log('Sending transaction...');
        
        // Get the transaction data from the quote
        const { transactionRequest } = quote;
        
        // Create a new transaction
        const transaction = new Transaction();
        
        // Add the transaction instructions from the quote
        if (transactionRequest.instructions) {
            transactionRequest.instructions.forEach(instruction => {
                transaction.add({
                    programId: new PublicKey(instruction.programId),
                    keys: instruction.keys.map(key => ({
                        pubkey: new PublicKey(key.pubkey),
                        isSigner: key.isSigner,
                        isWritable: key.isWritable
                    })),
                    data: Buffer.from(instruction.data, 'base64')
                });
            });
        }

        // Get recent blockhash
        console.log('Getting recent blockhash...');
        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = wallet.publicKey;
        
        // Sign the transaction
        transaction.sign(wallet);
        
        // Send the transaction
        const signature = await connection.sendRawTransaction(
            transaction.serialize(),
            { skipPreflight: false }
        );
        
        console.log('Transaction sent:', signature);
        
        // Wait for confirmation
        console.log('Waiting for transaction confirmation...');
        const confirmation = await connection.confirmTransaction(signature);
        
        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${confirmation.value.err}`);
        }

        // Check status for cross-chain transfers
        if (params.fromChain !== params.toChain) {
            let result;
            do {
                result = await getStatus(quote.tool, params.fromChain, params.toChain, signature);
                console.log('Transfer status:', result.status);
            } while (result.status !== 'DONE' && result.status !== 'FAILED');
        }

        console.log('Transaction completed successfully!');
    } catch (error) {
        console.error('Error in run:', error);
    }
}

console.log('Testing Li.Fi API functionality for Solana...');
run(); 