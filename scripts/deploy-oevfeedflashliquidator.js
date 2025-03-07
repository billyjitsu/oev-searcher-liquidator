const { JsonRpcProvider, Wallet } = require("ethers");
const api3Contracts = require("@api3/contracts");
const fs = require("fs");
const dotenv = require("dotenv");
const { ethers } = require("hardhat");

dotenv.config();

const deployFlashLiquidator = async () => {
  const targetNetworkProvider = new JsonRpcProvider(process.env.TARGET_NETWORK_RPC_URL);
  const targetNetworkWallet = Wallet.fromPhrase(process.env.MNEMONIC).connect(targetNetworkProvider);
  const chainId = (await targetNetworkProvider.getNetwork()).chainId;
  const api3ServerV1OevExtensionAddress = api3Contracts.deploymentAddresses.Api3ServerV1OevExtension[chainId];
  const lendingPool = process.env.LENDING_POOL_ADDRESS;
  const addressesProvider = process.env.LENDING_POOL_ADDRESS_PROVIDER;
  const dexAddress = process.env.DEX_ADDRESS;
  
  const FlashLiquidatorArtifact = await hre.artifacts.readArtifact("OevFlashLiquidator");

  const FlashLiquidatorFactory = new ethers.ContractFactory(
    FlashLiquidatorArtifact.abi,
    FlashLiquidatorArtifact.bytecode,
    targetNetworkWallet
  );

  const flashLiquidator = await FlashLiquidatorFactory.deploy(
    1, // dappId
    api3ServerV1OevExtensionAddress,
    lendingPool,
    addressesProvider,
    dexAddress
  );

  await flashLiquidator.waitForDeployment();

  console.log("OevFlashLiquidator deployed at:", flashLiquidator.target);

  // Save deployment address
  const deployments = fs.existsSync("scripts/deployments.json")
    ? JSON.parse(fs.readFileSync("scripts/deployments.json"))
    : {};
  
  deployments.OevFlashLiquidator = flashLiquidator.target;
  fs.writeFileSync("scripts/deployments.json", JSON.stringify(deployments, null, 2));
};

// Execute deployment
deployFlashLiquidator()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });