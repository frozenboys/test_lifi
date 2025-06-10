# Li.Fi Swap Testing Suite

This repository contains a comprehensive testing suite for Li.Fi swaps on Solana. It includes various scripts for testing quotes, executing swaps, and analyzing transaction results.

## Getting Started

### 1. Initial Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. **Install dependencies**:
   ```bash
   npm install node-fetch dotenv @solana/web3.js bs58
   ```

3. **Create environment file**:
   - Create a `.env` file in the root directory
   - Add your Solana wallet private key:
     ```
     SOL_SECRET=your_base58_encoded_private_key
     ```
   - You can get your private key from your Solana wallet (e.g., Phantom)
   - Make sure to export it in base58 format

4. **Verify wallet balance**:
   - Ensure your wallet has at least 0.02 SOL for testing
   - This covers transaction fees and test amounts

### 2. Configuration

1. **Token Addresses**:
   - Default test uses SOL to USDT
   - SOL: `So11111111111111111111111111111111111111112`
   - USDT: `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`
   - To test other tokens, modify the addresses in the scripts

2. **Test Amounts**:
   - Small: 0.01 SOL (`10000000` lamports)
   - Medium: 0.1 SOL (`100000000` lamports)
   - Large: 1 SOL (`1000000000` lamports)
   - Adjust amounts in `test-scenarios.js` as needed

3. **Network Settings**:
   - All scripts use Solana mainnet
   - RPC URL: `https://api.mainnet-beta.solana.com`
   - To use devnet, modify the connection URL in scripts

### 3. Running Tests

1. **Start with Quote Testing**:
   ```bash
   node test-quote.js
   ```
   - This will test if you can get quotes
   - Check `lifi_quotes.log` for results
   - No actual transactions are executed

2. **Test Multiple Scenarios**:
   ```bash
   node test-scenarios.js
   ```
   - Tests different swap amounts
   - Compares quotes across scenarios
   - Results in `lifi_test_results.log`

3. **Execute Full Swap**:
   ```bash
   node test-swap.js
   ```
   - This will:
     1. Check connection
     2. Get quote
     3. Ask for confirmation
     4. Execute swap
     5. Analyze results
   - All details in `swap_analysis.log`

4. **Analyze Transaction**:
   ```bash
   node test-transaction-info.js
   ```
   - Use after executing a swap
   - Provides detailed transaction analysis
   - Results in `transaction_analysis.log`

### 4. Understanding Results

1. **Log Files**:
   - Each script creates its own log file
   - Check timestamps for chronological order
   - Look for error messages if something fails

2. **Transaction Analysis**:
   - Compare quoted vs actual amounts
   - Check slippage impact
   - Verify fees and rates

3. **Common Metrics**:
   - Input/Output amounts
   - Exchange rates
   - Fees (gas and protocol)
   - Slippage percentage

### 5. Custom Testing

1. **Modify Test Parameters**:
   - Edit token addresses in scripts
   - Change test amounts
   - Adjust slippage tolerance

2. **Add New Scenarios**:
   - Add to `testScenarios` array in `test-scenarios.js`
   - Follow the existing format
   - Include name, tokens, and amount

3. **Test Different Tokens**:
   - Update token addresses
   - Verify token decimals
   - Check liquidity availability

## Prerequisites

- Node.js installed
- A Solana wallet with some SOL for testing
- Required npm packages:
  ```bash
  npm install node-fetch dotenv @solana/web3.js bs58
  ```

## Environment Setup

1. Create a `.env` file in the root directory
2. Add your Solana wallet private key:
   ```
   SOL_SECRET=your_base58_encoded_private_key
   ```

## Test Files Overview

### 1. test-swap.js
The main comprehensive testing script that combines all functionality:
- Checks token connections
- Gets quotes
- Executes swaps
- Analyzes transaction results
- Logs everything to `swap_analysis.log`

Usage:
```bash
node test-swap.js
```

### 2. test-quote.js
A simple script for testing Li.Fi quotes:
- Gets quotes for token swaps
- Logs quote details including:
  - Input/output amounts
  - Exchange rates
  - Estimated fees
  - Slippage
- Logs to `lifi_quotes.log`

Usage:
```bash
node test-quote.js
```

### 3. test-scenarios.js
Tests multiple swap scenarios with different amounts:
- Tests small, medium, and large swap amounts
- Compares quotes across different scenarios
- Useful for testing price impact
- Logs to `lifi_test_results.log`

Usage:
```bash
node test-scenarios.js
```

### 4. test-transaction.js
Executes actual swaps:
- Gets quotes
- Executes transactions
- Handles transaction signing
- Confirms transaction status
- Logs to `lifi_swaps.log`

Usage:
```bash
node test-transaction.js
```

### 5. test-transaction-info.js
Analyzes completed transactions:
- Fetches transaction details from Shyft API
- Shows actual swap amounts
- Calculates real rates
- Compares with quoted rates
- Logs to `transaction_analysis.log`

Usage:
```bash
node test-transaction-info.js
```

## Log Files

Each script creates its own log file:
- `swap_analysis.log`: Complete swap analysis (test-swap.js)
- `lifi_quotes.log`: Quote details (test-quote.js)
- `lifi_test_results.log`: Scenario test results (test-scenarios.js)
- `lifi_swaps.log`: Swap execution details (test-transaction.js)
- `transaction_analysis.log`: Transaction analysis (test-transaction-info.js)

## Testing Different Scenarios

1. **Basic Quote Testing**:
   ```bash
   node test-quote.js
   ```

2. **Multiple Scenarios**:
   ```bash
   node test-scenarios.js
   ```

3. **Full Swap Testing**:
   ```bash
   node test-swap.js
   ```

4. **Transaction Analysis**:
   ```bash
   node test-transaction-info.js
   ```

## Important Notes

1. **Safety**:
   - Always test with small amounts first
   - Keep your private key secure
   - Check log files for detailed analysis

2. **Network**:
   - All scripts use Solana mainnet
   - Ensure sufficient SOL for testing
   - Consider network fees

3. **Rate Limiting**:
   - Scripts include delays between requests
   - Be mindful of API rate limits

4. **Error Handling**:
   - All scripts include comprehensive error handling
   - Check log files for detailed error messages

## Example Test Flow

1. Start with quote testing:
   ```bash
   node test-quote.js
   ```

2. Test multiple scenarios:
   ```bash
   node test-scenarios.js
   ```

3. Execute a full swap:
   ```bash
   node test-swap.js
   ```

4. Analyze the transaction:
   ```bash
   node test-transaction-info.js
   ```

## Troubleshooting

1. **SOL_SECRET Error**:
   - Check if `.env` file exists
   - Verify private key format

2. **Insufficient Balance**:
   - Add more SOL to your wallet
   - Check minimum required amounts

3. **Transaction Failures**:
   - Check log files for error details
   - Verify token addresses
   - Ensure sufficient SOL for fees

4. **API Errors**:
   - Check network connection
   - Verify API endpoints
   - Check rate limits

## Contributing

Feel free to submit issues and enhancement requests! 