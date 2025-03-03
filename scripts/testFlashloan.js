const { JsonRpcProvider, Wallet, Contract, parseUnits } = require("ethers");
const dotenv = require("dotenv");
const fs = require("fs");

dotenv.config();

const LIQUIDATOR_ABI = [
    "function executeFlashLoan((address[],uint256[],uint256[],address,bytes,uint16)) external",
    "function withdrawToken(address,uint256) external"
];

const ERC20_ABI = [
    "function approve(address,uint256) external returns (bool)",
    "function transfer(address,uint256) external returns (bool)",
    "function balanceOf(address) external view returns (uint256)"
];

async function testFlashLoan() {
    // Setup provider and wallet
    const provider = new JsonRpcProvider(process.env.TARGET_NETWORK_RPC_URL);
    const wallet = Wallet.fromPhrase(process.env.MNEMONIC).connect(provider);
    
    // Load deployment address
    const deployments = JSON.parse(fs.readFileSync("./scripts/deployments.json"));
    const liquidatorAddress = deployments.OevFlashLiquidator;

    // Initialize contracts
    const liquidator = new Contract(liquidatorAddress, LIQUIDATOR_ABI, wallet);
    const tokenToFlashLoan = new Contract(process.env.TOKEN_TO_REPAY_ADDRESS, ERC20_ABI, wallet);

    // Setup flash loan parameters
    const flashLoanAmount = parseUnits("10", 6); // Adjust decimals as needed
    
    // Create the struct as an array with the proper order of fields
    const flashLoanParams = [
        [process.env.TOKEN_TO_REPAY_ADDRESS],  // assets array
        [flashLoanAmount],                     // amounts array
        [0],                                   // modes array (0 = no debt/flash loan)
        liquidatorAddress,                     // onBehalfOf
        "0x",                                  // params (empty for testing)
        0                                      // referralCode
    ];

    try {
        // Get current nonce for wallet
        const nonce = await provider.getTransactionCount(wallet.address);
        console.log(`Current nonce for ${wallet.address}: ${nonce}`);

        // First, fund contract with some tokens to cover the premium (usually 0.09%)
        const premium = flashLoanAmount * 10n / 10000n; // 0.1%
        console.log(`Funding contract with ${premium} tokens for premium...`);
        
        const transferTx = await tokenToFlashLoan.transfer(
            liquidatorAddress, 
            premium,
            { nonce: nonce }
        );
        await transferTx.wait();
        console.log("Premium transfer complete");
        
        // Execute flash loan with the next nonce
        console.log("Executing flash loan...");
        const tx = await liquidator.executeFlashLoan(
            flashLoanParams,
            { 
                nonce: nonce + 1,
                gasLimit: 3000000 // Set a specific gas limit to avoid estimation issues
            }
        );
        
        console.log("Waiting for transaction confirmation...");
        const receipt = await tx.wait();
        
        console.log("Flash loan executed successfully!");
        console.log("Transaction hash:", receipt.hash);
        
        // Check final balance
        const finalBalance = await tokenToFlashLoan.balanceOf(liquidatorAddress);
        console.log("Final contract balance:", finalBalance.toString());

    } catch (error) {
        console.error("Error executing flash loan:", error);
        
        // More detailed error reporting
        if (error.info) {
            console.error("Error info:", JSON.stringify(error.info, null, 2));
        }
        if (error.transaction) {
            console.error("Transaction data:", error.transaction.data);
            console.error("Transaction to:", error.transaction.to);
            console.error("Transaction from:", error.transaction.from);
        }
    }
}

testFlashLoan()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });