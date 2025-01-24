const { JsonRpcProvider, Wallet } = require("ethers");
const api3Contracts = require("@api3/contracts");
const fs = require("fs");
const dotenv = require("dotenv");
const { ethers } = require("hardhat");

dotenv.config();

const deployOevFeedUpdater = async () => {
  const targetNetworkProvider = new JsonRpcProvider(process.env.TARGET_NETWORK_RPC_URL);
  const targetNetworkWallet = Wallet.fromPhrase(process.env.MNEMONIC).connect(targetNetworkProvider);
  const chainId = (await targetNetworkProvider.getNetwork()).chainId;
  const api3ServerV1OevExtensionAddress = api3Contracts.deploymentAddresses.Api3ServerV1OevExtension[chainId];

  const OevFeedUpdaterArtifact = await hre.artifacts.readArtifact("OevFeedUpdater");

  const OevFeedUpdaterFactory = new ethers.ContractFactory(
    OevFeedUpdaterArtifact.abi,
    OevFeedUpdaterArtifact.bytecode,
    targetNetworkWallet
  );
  const OevFeedUpdater = await OevFeedUpdaterFactory.deploy(
    1, // dappId
    api3ServerV1OevExtensionAddress
  );

  console.log("OevFeedUpdater deployed at:", OevFeedUpdater.target);

  // Save the address to deployments.json, creating the file if it does not exist
  const deployments = fs.existsSync("scripts/deployments.json")
    ? JSON.parse(fs.readFileSync("scripts/deployments.json"))
    : {};
  deployments.OevFeedUpdater = OevFeedUpdater.target;
  fs.writeFileSync("scripts/deployments.json", JSON.stringify(deployments, null, 2));
};

deployOevFeedUpdater();
