const { ethers } = require('ethers');
require('dotenv').config();

// Updated wallet setup for ethers v6
const mnemonic = process.env.MNEMONIC;
const provider = new ethers.JsonRpcProvider(process.env.TARGET_NETWORK_RPC_URL);
const wallet = ethers.Wallet.fromPhrase(mnemonic);
const signer = wallet.connect(provider);

// Contract ABI remains the same
const abi = [
  "function updateValue(int224 _value) external",
];

const mockProxyAddress = process.env.COLLATERAL_MOCKPROXY_ADDRESS;

async function updatePriceValue() {
  // Create contract instance
  const contract = new ethers.Contract(mockProxyAddress, abi, signer);

  try {
    console.log(`Updating mock proxy price`);
  
    const newValue = 700903720000000000n; 

    // Call updateValue function
    const tx = await contract.updateValue(newValue);
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
  }
}

async function main() {
  try {
    await updatePriceValue();
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

main();