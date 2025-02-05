const { ethers } = require('ethers');
require('dotenv').config();

// Contract ABI - we only need the read function
const abi = [
  "function read() view returns (int224, uint256)",
  "function assetProxy() view returns (address)"
];

// Setup provider and wallet
const provider = new ethers.JsonRpcProvider(process.env.TARGET_NETWORK_RPC_URL);
const wallet = ethers.Wallet.fromPhrase(process.env.MNEMONIC);
const signer = wallet.connect(provider);

async function readMockValue(mockProxyAddress) {
  const contract = new ethers.Contract(mockProxyAddress, abi, provider);

  try {
    // Read the current value and timestamp
    const [value, timestamp] = await contract.read();
    
    // Get the asset proxy address
    const assetProxyAddress = await contract.assetProxy();
    
    // Format the value to a more readable format (assuming 18 decimals)
    const formattedValue = ethers.formatUnits(value, 18);
    
    // Convert timestamp to human readable date
    const date = new Date(Number(timestamp) * 1000);

    console.log('Current Mock Proxy Values:');
    console.log('--------------------------');
    console.log(`Value: ${formattedValue}`);
    console.log(`Raw Value: ${value}`);
    console.log(`Timestamp: ${date.toLocaleString()}`);
    console.log(`Asset Proxy Address: ${assetProxyAddress}`);

    return { value, timestamp, assetProxyAddress, formattedValue };
  } catch (error) {
    console.error('Error reading mock value:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const mockProxyAddress = process.env.COLLATERAL_MOCKPROXY_ADDRESS;
  
  if (!mockProxyAddress) {
    console.error('Error: COLLATERAL_MOCKPROXY_ADDRESS not set in .env file');
    process.exit(1);
  }

  readMockValue(mockProxyAddress)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

// Export for use in other scripts
module.exports = {
  readMockValue
};