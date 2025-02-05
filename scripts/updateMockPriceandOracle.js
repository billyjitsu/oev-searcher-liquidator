const { ethers } = require('ethers');
require('dotenv').config();

// Configuration
const newPriceValue = 700903720000000000n;
const provider = new ethers.JsonRpcProvider(process.env.TARGET_NETWORK_RPC_URL);
const wallet = ethers.Wallet.fromPhrase(process.env.MNEMONIC);
const signer = wallet.connect(provider);

// Contract addresses
// The replacement mock price feed adaptor you will change the feed to
const mockProxyAddress = process.env.COLLATERAL_MOCKPROXY_ADDRESS;
// The original proxy contract address you got from market.api.org
const originalOracleAddress = process.env.ORIGINAL_API3_ORACLE_PROXY;
// The current adaptor contract address the dapp is using in you deployed address
const collateralAssetProxy = process.env.COLLATERAL_ASSET_PROXY;
// The current USDC/USD contracta address the dapp is using in you deployed address
const usdcUsdProxy = process.env.USDCUSD_PROXY;

// Contract ABIs
const mockProxyAbi = [
  "function updateValue(int224 _value) external",
  "function setAssetProxy(address _assetProxy) external"
];

const oracleAdaptorAbi = [
  "function changeProxyAddress(address _assetProxy, address _UsdcUsdProxy) external",
  "function owner() view returns (address)"
];

async function updateMockPrice(priceValue) {
  const contract = new ethers.Contract(mockProxyAddress, mockProxyAbi, signer);

  try {
    console.log(`Updating mock proxy price to: ${priceValue}`);
    const tx = await contract.updateValue(priceValue);
    console.log('Transaction sent:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt.blockNumber);
    return receipt;
  } catch (error) {
    console.error('Error updating mock price:', error);
    throw error;
  }
}

async function setMockAssetProxy(proxyAddress) {
  const contract = new ethers.Contract(mockProxyAddress, mockProxyAbi, signer);

  try {
    console.log(`Setting asset proxy address to: ${proxyAddress}`);
    const tx = await contract.setAssetProxy(proxyAddress);
    console.log('Transaction sent:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt.blockNumber);
    return receipt;
  } catch (error) {
    console.error('Error setting asset proxy:', error);
    throw error;
  }
}

async function updateOracleProxy(newAssetProxy) {
  const contract = new ethers.Contract(collateralAssetProxy, oracleAdaptorAbi, signer);

  try {
    // Verify ownership
    const contractOwner = await contract.owner();
    if (contractOwner.toLowerCase() !== signer.address.toLowerCase()) {
      throw new Error(`Signer (${signer.address}) is not the contract owner (${contractOwner})`);
    }

    console.log('Updating oracle proxy addresses...');
    console.log(`Contract Address: ${collateralAssetProxy}`);
    console.log(`New Asset Proxy: ${newAssetProxy}`);
    console.log(`USDC/USD Proxy: ${usdcUsdProxy}`);

    const tx = await contract.changeProxyAddress(newAssetProxy, usdcUsdProxy);
    console.log('Transaction sent:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt.blockNumber);
    return receipt;
  } catch (error) {
    console.error('Error updating oracle proxy:', error);
    throw error;
  }
}

async function executeFullUpdate(priceValue = newPriceValue) {
  try {
    // Step 1: Update the mock price
    await updateMockPrice(priceValue);
    
    // // Step 2: Set the asset proxy to the original oracle
    // await setMockAssetProxy(originalOracleAddress);
    
    // // Step 3: Update the oracle proxy to use the mock
    // await updateOracleProxy(mockProxyAddress);
    
    console.log('Full update sequence completed successfully');
  } catch (error) {
    console.error('Error in full update sequence:', error);
    throw error;
  }
}

// Export functions for use in other scripts
module.exports = {
  updateMockPrice,
  setMockAssetProxy,
  updateOracleProxy,
  executeFullUpdate
};

// Run if called directly
if (require.main === module) {
  executeFullUpdate()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}