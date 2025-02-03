const { parseUnits, Contract, JsonRpcProvider, Wallet } = require("ethers");
const deployments = require("./deployments.json"); 
const dotenv = require("dotenv");
dotenv.config();

async function fundLiquidator() {
 

  const provider = new JsonRpcProvider(process.env.TARGET_NETWORK_RPC_URL);
  const wallet = Wallet.fromPhrase(process.env.MNEMONIC).connect(provider);

  const erc20Abi = [
    "function decimals() view returns (uint8)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)"
  ];

  const token = new Contract(process.env.TOKEN_ADDRESS, erc20Abi, wallet);
  const decimals = await token.decimals();
  const amount = parseUnits("2000", decimals);

  const tx = await token.transfer(deployments.OevLiquidator, amount);
  await tx.wait();

  console.log(`Transferred 2000 tokens to ${deployments.OevLiquidator}`);
}

fundLiquidator();