const { ethers } = require('ethers');
require('dotenv').config();

// Simplified wallet setup
const mnemonic = process.env.MNEMONIC;
const provider = new ethers.JsonRpcProvider(process.env.TARGET_NETWORK_RPC_URL);
const wallet = ethers.Wallet.fromPhrase(mnemonic);
const signer = wallet.connect(provider);

// Correct ABI for the contract functions
const abi = [
  "function changeProxyAddress(address _assetProxy, address _UsdcUsdProxy) external",
  "function latestAnswer() view returns (int256)",
  "function owner() view returns (address)"
];

// Configuration
const newAssetProxyAddress = process.env.COLLATERAL_MOCKPROXY_ADDRESS; // Our simulated mock price
const contractAddress = process.env.COLLATERAL_ASSET_PROXY; // The api3 adaptor address for price feed
const usdcUsdProxy = process.env.USDCUSD_PROXY; 

async function updateProxyAddress(newAssetProxy) {
  // Create contract instance
  const contract = new ethers.Contract(contractAddress, abi, signer);

  try {
    // Check if the signer is the owner of the contract
    // const contractOwner = await contract.owner();
    // if (contractOwner.toLowerCase() !== signer.address.toLowerCase()) {
    //   console.error(`Error: The signer (${signer.address}) is not the owner of the contract (${contractOwner})`);
    //   return;
    // }

    console.log(`Updating proxy addresses...`);
    console.log(`Contract Address: ${contractAddress}`);
    console.log(`New Asset Proxy: ${newAssetProxy}`);
    console.log(`New USDC/USD Proxy: ${usdcUsdProxy}`);

    // Call changeProxyAddress function
    const tx = await contract.changeProxyAddress(newAssetProxy, usdcUsdProxy);
    console.log('Transaction sent:', tx.hash);
    
    // Wait for transaction to be mined
    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt.blockNumber);

  } catch (error) {
    console.error('Error:', error);
    // v6 error handling
    if (error.data) {
      console.error('Error data:', error.data);
    }
    throw error; // Re-throw to be caught by main
  }
}

async function main() {
  try {
    await updateProxyAddress(newAssetProxyAddress);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();