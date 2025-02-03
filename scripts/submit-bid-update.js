const { Wallet, Contract, JsonRpcProvider, keccak256, solidityPacked, parseEther, MaxUint256 } = require("ethers");
const api3Contracts = require("@api3/contracts");
const { fetchOEVSignedData } = require("./fetch-oevsigneddata");
const deployments = require("./deployments.json");
const dotenv = require("dotenv");

dotenv.config();

const OEV_AUCTION_LENGTH_SECONDS = 30;
const OEV_BIDDING_PHASE_LENGTH_SECONDS = 25;
const OEV_BIDDING_PHASE_BUFFER_SECONDS = 3;
const OEV_AUCTIONS_MAJOR_VERSION = 1;
const DAPP_ID = 1; // The dAppId of the communal proxies

const oevNetworkProvider = new JsonRpcProvider(process.env.OEV_NETWORK_RPC_URL);
const oevNetworkWallet = Wallet.fromPhrase(process.env.MNEMONIC).connect(oevNetworkProvider);
const targetNetworkProvider = new JsonRpcProvider(process.env.TARGET_NETWORK_RPC_URL);
const targetNetworkWallet = Wallet.fromPhrase(process.env.MNEMONIC).connect(targetNetworkProvider);

const BID_AMOUNT = process.env.BID_AMOUNT || "0.001"; // Default: 0.01 MNT
const DAPI_NAME = process.env.DAPI_NAME || "ETH/USD"; // Default: ETH/USD

const determineSignedDataTimestampCutoff = () => {
  const auctionOffset = Number(
    BigInt(ethers.solidityPackedKeccak256(["uint256"], [DAPP_ID])) % BigInt(OEV_AUCTION_LENGTH_SECONDS)
  );
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const timeInCurrentAuction = (currentTimestamp - auctionOffset) % OEV_AUCTION_LENGTH_SECONDS;
  const auctionStartTimestamp = currentTimestamp - timeInCurrentAuction;
  const biddingPhaseEndTimestamp = auctionStartTimestamp + OEV_BIDDING_PHASE_LENGTH_SECONDS;
  let signedDataTimestampCutoff = auctionStartTimestamp + OEV_BIDDING_PHASE_LENGTH_SECONDS;

  if (biddingPhaseEndTimestamp - currentTimestamp < OEV_BIDDING_PHASE_BUFFER_SECONDS) {
    console.log(
      "Not enough time to place bid in current auction, bidding for the next one",
      currentTimestamp,
      biddingPhaseEndTimestamp,
      auctionOffset
    );
    signedDataTimestampCutoff += OEV_AUCTION_LENGTH_SECONDS;
  }

  return signedDataTimestampCutoff;
};

const getBidTopic = (signedDataTimestampCutoff) => {
  return ethers.solidityPackedKeccak256(
    ["uint256", "uint256", "uint32", "uint32"],
    [OEV_AUCTIONS_MAJOR_VERSION, DAPP_ID, OEV_AUCTION_LENGTH_SECONDS, signedDataTimestampCutoff]
  );
};

// Function to encode the bid details and return to bytes
const getBidDetails = (OevFeedUpdaterAddress) => {
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  return ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [OevFeedUpdaterAddress, nonce]);
};

const placeBid = async () => {
  // Fetch the OEV signed data to bid on
  const priceUpdateDetails = await fetchOEVSignedData(DAPI_NAME);

  const targetChainId = (await targetNetworkProvider.getNetwork()).chainId;

  const OevAuctionHouseArtifact = await hre.artifacts.readArtifact("OevAuctionHouse");
  const OevAuctionHouse = new Contract(
    api3Contracts.deploymentAddresses.OevAuctionHouse["4913"],
    OevAuctionHouseArtifact.abi,
    oevNetworkWallet
  );

  const signedDataTimestampCutoff = determineSignedDataTimestampCutoff();
  const nextBiddingPhaseEndTimestamp = signedDataTimestampCutoff + OEV_AUCTION_LENGTH_SECONDS;

  const bidTopic = getBidTopic(signedDataTimestampCutoff);

  const bidDetails = getBidDetails(
    deployments.OevFeedUpdater // Your deployed MultiCall contract Address
  );

  console.log("Placing bid with the following details:");
  console.log("Bid Topic:", bidTopic);
  console.log("Bid Details:", bidDetails);
  console.log("Current Timestamp:", Math.floor(Date.now() / 1000));
  console.log("Signed Data Timestamp Cutoff:", signedDataTimestampCutoff);
  console.log("Next Bidding Phase End Timestamp:", nextBiddingPhaseEndTimestamp);

  // Placing our bid with the auction house on OEV network
  const placedbidTx = await OevAuctionHouse.placeBidWithExpiration(
    bidTopic, // The bid topic of the auctioneer instance
    parseInt(targetChainId), // Chain ID of the dAPI proxy
    parseEther(BID_AMOUNT), // The amount of chain native currency you are bidding to win this auction and perform the oracle update
    bidDetails, // The details about the bid, proxy address, condition, price, your deployed multicall and random
    MaxUint256, // Collateral Basis Points is set to max
    MaxUint256, // Protocol Fee Basis Points is set to max
    nextBiddingPhaseEndTimestamp // The expiration time of the bid
  );
  console.log("Bid Tx Hash", placedbidTx.hash);
  console.log("Bid placed");

  // Compute the bid ID
  const bidId = keccak256(
    solidityPacked(
      ["address", "bytes32", "bytes32"],
      [
        oevNetworkWallet.address, // The wallet address if the signer doing the bid (public of your private key)
        bidTopic, // Details of the chain and price feed we want to update encoded
        keccak256(bidDetails), // The details about the bid, proxy address, condition, price, your deployed multicall and random
      ]
    )
  );

  const awardedSignature = await new Promise(async (resolve, reject) => {
    console.log("Waiting for bid to be awarded...");
    const OevAuctionHouseFilter = OevAuctionHouse.filters.AwardedBid(null, bidTopic, bidId, null, null);
    while (true) {
      const bid = await OevAuctionHouse.bids(bidId);
      if (bid[0] === 2n) {
        console.log("Bid Awarded");
        const currentBlock = await oevNetworkProvider.getBlockNumber();
        const awardEvent = await OevAuctionHouse.queryFilter(OevAuctionHouseFilter, currentBlock - 10, currentBlock);
        resolve(awardEvent[0].args[3]);
        break;
      }
      // Sleep for 0.1 second
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  const updateTx = await performOevUpdate(awardedSignature, signedDataTimestampCutoff, priceUpdateDetails);

  const reportTx = await reportFulfillment(updateTx, bidTopic, bidDetails, bidId);
};

const performOevUpdate = async (awardedSignature, signedDataTimestampCutoff, priceUpdateDetails) => {
  const OevFeedUpdaterArtifact = await hre.artifacts.readArtifact("OevFeedUpdater");
  const OevFeedUpdater = new Contract(deployments.OevFeedUpdater, OevFeedUpdaterArtifact.abi, targetNetworkWallet);

  const payOevBidCallbackData = {
    signedDataArray: priceUpdateDetails,
  };

  const PayBidAndUpdateFeeds = {
    signedDataTimestampCutoff,
    signature: awardedSignature,
    bidAmount: parseEther(BID_AMOUNT),
    payOevBidCallbackData: payOevBidCallbackData,
  };

  console.log("Performing Oracle update...");
  const updateTx = await OevFeedUpdater.payBidAndUpdateFeed(PayBidAndUpdateFeeds, {
    value: parseEther(BID_AMOUNT),
  });
  await updateTx.wait();
  console.log("Oracle update performed, Tx Hash:", updateTx.hash);
  return updateTx;
};

const reportFulfillment = async (updateTx, bidTopic, bidDetails, bidId) => {
  const oevNetworkProvider = new JsonRpcProvider(process.env.OEV_NETWORK_RPC_URL);
  const oevNetworkWallet = Wallet.fromPhrase(process.env.MNEMONIC).connect(oevNetworkProvider);
  const OevAuctionHouseArtifact = await hre.artifacts.readArtifact("OevAuctionHouse");
  const OevAuctionHouse = new Contract(
    api3Contracts.deploymentAddresses.OevAuctionHouse["4913"],
    OevAuctionHouseArtifact.abi,
    oevNetworkWallet
  );
  const bidDetailsHash = keccak256(bidDetails);

  const reportTx = await OevAuctionHouse.reportFulfillment(
    bidTopic, // The bid topic of the auctioneer instance
    bidDetailsHash, // Hash of the bid details
    updateTx.hash // The transaction hash of the update transaction
  );
  await reportTx.wait();
  console.log("Oracle update reported");

  const confirmedFulfillmentTx = await new Promise(async (resolve, reject) => {
    console.log("Waiting for confirmation of fulfillment...");
    const OevAuctionHouseFilter = OevAuctionHouse.filters.ConfirmedFulfillment(null, bidTopic, bidId, null, null);
    while (true) {
      const currentBlock = await oevNetworkProvider.getBlockNumber();
      const confirmEvent = await OevAuctionHouse.queryFilter(OevAuctionHouseFilter, currentBlock - 10, currentBlock);
      if (confirmEvent.length > 0) {
        console.log("Confirmed Fulfillment", confirmEvent[0].transactionHash);
        resolve(confirmEvent);
        break;
      }
      // Sleep for 0.1 second
      await new Promise((r) => setTimeout(r, 100));
    }
  });

  return confirmedFulfillmentTx;
};

placeBid();
