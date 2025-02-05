const { ethers } = require("ethers");
const api3Contracts = require("@api3/contracts");

function deriveOevTemplateId(templateId) {
  return ethers.keccak256(ethers.toBeHex(templateId));
}

function calculateMedianPrice(priceDetails) {
    return priceDetails
        .map((price) => price.decodedValue)
        .sort((a, b) => a - b)
        .reduce((_, __, ___, arr) => {
            const len = arr.length;
            const median = len % 2 === 0 ? 
                (arr[len / 2 - 1] + arr[len / 2]) / 2 : 
                arr[(len - 1) / 2];
            return median;
        });
}

async function fetchOEVSignedData(DAPI_NAME) {
  try {
    const RPC_URL = process.env.TARGET_NETWORK_RPC_URL;
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const chainId = (await provider.getNetwork()).chainId;

    const api3ServerV1Address = api3Contracts.deploymentAddresses.Api3ServerV1[chainId];
    const airseekerRegistryAddress = api3Contracts.deploymentAddresses.AirseekerRegistry[chainId];
    const api3ServerV1Abi = api3Contracts.Api3ServerV1__factory.abi;
    const airSeekerRegistryAbi = api3Contracts.AirseekerRegistry__factory.abi;

    console.log("Fetching OEV signed data for", DAPI_NAME);
    const encodedDapiName = ethers.encodeBytes32String(DAPI_NAME);
    console.log("Encoded Dapi Name:", encodedDapiName);

    const encodedDapiNameHash = ethers.keccak256(encodedDapiName);
    console.log("Encoded Dapi Name Hash:", encodedDapiNameHash);

    const api3ServerV1 = new ethers.Contract(api3ServerV1Address, api3ServerV1Abi, provider);
    const airseekerRegistry = new ethers.Contract(airseekerRegistryAddress, airSeekerRegistryAbi, provider);

    const dataFeedId = await api3ServerV1.dapiNameHashToDataFeedId(encodedDapiNameHash);
    console.log("Data Feed ID:", dataFeedId);

    const dataFeedDetails = await airseekerRegistry.dataFeedIdToDetails(dataFeedId);
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const [airnodes, templateIds] = abiCoder.decode(["address[]", "bytes32[]"], dataFeedDetails);

    const priceDetails = [];

    for (let i = 0; i < airnodes.length; i++) {
      const oevTemplateId = deriveOevTemplateId(templateIds[i]);

      try {
        const response = await fetch(`https://signed-api.api3.org/public-oev/${airnodes[i]}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        const relevantUpdates = Object.values(data.data).filter((update) => update.templateId === oevTemplateId);

        if (relevantUpdates.length > 0) {
          const latestUpdate = relevantUpdates.sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp))[0];
          const decodedValueWei = BigInt(latestUpdate.encodedValue);
          const decodedValueUSD = Number(decodedValueWei) / 1e18;

          priceDetails.push({
            airnode: airnodes[i],
            encodedValue: latestUpdate.encodedValue,
            signature: latestUpdate.signature,
            templateId: templateIds[i],
            templateIdOEV: latestUpdate.templateId,
            timestamp: latestUpdate.timestamp,
            decodedValue: decodedValueUSD,
            decodedtimestamp: new Date(parseInt(latestUpdate.timestamp) * 1000),
          });
        }
      } catch (error) {
        console.log(`Error fetching data for airnode ${airnodes[i]}:`, error.message);
      }
    }

    const medianPrice = calculateMedianPrice(priceDetails);
    console.log("Median Price:", medianPrice);

    const priceUpdateDetailsEncoded = priceDetails.map((priceUpdate) => {
      return ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "bytes32", "uint256", "bytes", "bytes"],
        [
          priceUpdate.airnode,
          priceUpdate.templateId,
          priceUpdate.timestamp,
          priceUpdate.encodedValue,
          priceUpdate.signature,
        ]
      );
    });

    return {
      priceUpdateDetailsEncoded,
      medianPrice
    };
  } catch (error) {
    console.error("Error:", error);
    throw error;
  }
}

module.exports = {
  fetchOEVSignedData,
};