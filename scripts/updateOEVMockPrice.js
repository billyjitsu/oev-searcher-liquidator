const { ethers } = require('ethers');
require('dotenv').config();

// Updated wallet setup for ethers v6
const mnemonic = process.env.MNEMONIC;
const provider = new ethers.JsonRpcProvider(process.env.TARGET_NETWORK_RPC_URL);
const wallet = ethers.Wallet.fromPhrase(mnemonic);
const signer = wallet.connect(provider);

const abi = [
  "function updateValue(int224 _value) external",
  "function setAssetProxy(address _assetProxy) external"
];

const mockProxyAddress = process.env.COLLATERAL_MOCKPROXY_ADDRESS;

async function setAssetProxy(proxyAddress) {
  const contract = new ethers.Contract(mockProxyAddress, abi, signer);

  try {
    console.log(`Setting asset proxy address to: ${proxyAddress}`);
    
    const tx = await contract.setAssetProxy(proxyAddress);
    console.log('Transaction sent:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt.blockNumber);
  } catch (error) {
    console.error('Error:', error);
    if (error.data) {
      console.error('Error data:', error.data);
    }
  }
}

async function updatePriceValue() {
  const contract = new ethers.Contract(mockProxyAddress, abi, signer);

  try {
    console.log(`Updating mock proxy price`);
  
    const newValue = 700903720000000000n; 

    const tx = await contract.updateValue(newValue);
    console.log('Transaction sent:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt.blockNumber);

  } catch (error) {
    console.error('Error:', error);
    if (error.data) {
      console.error('Error data:', error.data);
    }
  }
}

async function main() {
  try {
    // Add the proxy address to your .env file
    const proxyAddress = process.env.ASSET_PROXY_ADDRESS;
    
    // Update the price value
    await updatePriceValue();
    // Set the asset proxy
    await setAssetProxy(proxyAddress);
    
    
    
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();