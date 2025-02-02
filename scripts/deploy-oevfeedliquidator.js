const { JsonRpcProvider, Wallet } = require("ethers");
const api3Contracts = require("@api3/contracts");
const fs = require("fs");
const dotenv = require("dotenv");
const { ethers } = require("hardhat");

dotenv.config();

const deployLiquidator = async () => {

   // Deploy OEV Contracts
  const targetNetworkProvider = new JsonRpcProvider(process.env.TARGET_NETWORK_RPC_URL);
  const targetNetworkWallet = Wallet.fromPhrase(process.env.MNEMONIC).connect(targetNetworkProvider);
  const chainId = (await targetNetworkProvider.getNetwork()).chainId;
  const api3ServerV1OevExtensionAddress = api3Contracts.deploymentAddresses.Api3ServerV1OevExtension[chainId];
  const lendingPool = process.env.LENDING_POOL_ADDRESS;

  const OevLiquidatorArtifact = await hre.artifacts.readArtifact("OevLiquidator");

  const OevLiquidatorFactory = new ethers.ContractFactory(
    OevLiquidatorArtifact.abi,
    OevLiquidatorArtifact.bytecode,
    targetNetworkWallet
  );
  const OevLiquidator = await OevLiquidatorFactory.deploy(
    1, // dappId
    api3ServerV1OevExtensionAddress,
    lendingPool
  );

  console.log("OevLiquidator deployed at:", OevLiquidator.target);

  // Save the address to deployments.json, creating the file if it does not exist
  const deployments = fs.existsSync("scripts/deployments.json")
    ? JSON.parse(fs.readFileSync("scripts/deployments.json"))
    : {};
  deployments.OevLiquidator = OevLiquidator.target;
  fs.writeFileSync("scripts/deployments.json", JSON.stringify(deployments, null, 2));
};

deployLiquidator();
