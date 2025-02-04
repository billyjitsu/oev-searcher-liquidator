const { Wallet, Contract, JsonRpcProvider, keccak256, solidityPacked, parseEther, MaxUint256, HDNodeWallet, formatUnits } = require("ethers");
const api3Contracts = require("@api3/contracts");
const { fetchOEVSignedData } = require("./fetch-oevsigneddata");
const deployments = require("./deployments.json");
const dotenv = require("dotenv");

dotenv.config();

const OEV_AUCTION_LENGTH_SECONDS = 30;
const OEV_BIDDING_PHASE_LENGTH_SECONDS = 25;
const OEV_BIDDING_PHASE_BUFFER_SECONDS = 3;
const OEV_AUCTIONS_MAJOR_VERSION = 1;
const DAPP_ID = 1;

// Initialize providers and wallets
const oevNetworkProvider = new JsonRpcProvider(process.env.OEV_NETWORK_RPC_URL);
const targetNetworkProvider = new JsonRpcProvider(process.env.TARGET_NETWORK_RPC_URL);

// Get wallets from mnemonic
const hdNode = HDNodeWallet.fromPhrase(process.env.MNEMONIC);
const oevNetworkWallet = hdNode.connect(oevNetworkProvider);
const targetNetworkWallet = hdNode.connect(targetNetworkProvider);

// Get the user to liquidate
const userToLiquidate = process.env.WALLET_TO_LIQUIDATE;
console.log('User to liquidate:', userToLiquidate);

const BID_AMOUNT = process.env.BID_AMOUNT || "0.00001";
const DAPI_NAME = process.env.DAPI_NAME || "ETH/USD";

// Contract ABIs
const LENDING_POOL_ABI = [
    "function getUserAccountData(address) view returns (uint256,uint256,uint256,uint256,uint256,uint256)",
    "function liquidationCall(address collateralAsset, address debtAsset, address user, uint256 debtToCover, bool receiveAToken) external returns (uint256, string)"
];

// Full ABI for the OevLiquidator contract including struct definitions
const LIQUIDATOR_ABI = [
    "function payBidAndUpdateFeed((uint32,bytes,uint256,(bytes[],(address,address,address,uint256)))) external payable"
];

const getUserData = async (lendingPool, userAddress) => {
    try {
        console.log('Fetching detailed user position data...');
        const userData = await lendingPool.getUserAccountData(userAddress);
        
        const [
            totalCollateralETH,
            totalDebtETH,
            availableBorrowsETH,
            currentLiquidationThreshold,
            ltv,
            healthFactor
        ] = userData;

        const formattedData = {
            totalCollateralETH: formatUnits(totalCollateralETH, 18),
            totalDebtETH: formatUnits(totalDebtETH, 18),
            availableBorrowsETH: formatUnits(availableBorrowsETH, 18),
            currentLiquidationThreshold: Number(currentLiquidationThreshold) / 100,
            ltv: Number(ltv) / 100,
            healthFactor: formatUnits(healthFactor, 18),
            maxLiquidatableAmount: formatUnits(totalDebtETH * 50n / 100n, 18)
        };

        // If you want to log the details, uncomment the following lines

        // console.log('\nPosition Details:');
        // console.log('------------------');
        // console.log(`Total Collateral (ETH): ${formattedData.totalCollateralETH}`);
        // console.log(`Total Debt (ETH): ${formattedData.totalDebtETH}`);
        // console.log(`Available Borrows (ETH): ${formattedData.availableBorrowsETH}`);
        // console.log(`Liquidation Threshold: ${formattedData.currentLiquidationThreshold}%`);
        // console.log(`LTV: ${formattedData.ltv}%`);
        // console.log(`Health Factor: ${formattedData.healthFactor}`);
        // console.log(`Max Liquidatable Amount (ETH): ${formattedData.maxLiquidatableAmount}`);

        return {
            ...formattedData,
            rawHealthFactor: healthFactor
        };
    } catch (error) {
        console.error('Error getting user data:', error);
        throw error;
    }
};

const checkHealthFactor = async (lendingPool, userAddress) => {
    try {
        console.log('\nChecking health factor...');
        const userData = await getUserData(lendingPool, userAddress);
        const healthFactorValue = Number(userData.healthFactor);
        console.log('Health Factor:', healthFactorValue.toFixed(6));
        return healthFactorValue < 1.0;
    } catch (error) {
        console.error('Error checking health factor:', error);
        throw error;
    }
};

const determineSignedDataTimestampCutoff = () => {
    const auctionOffset = Number(
        BigInt(keccak256(solidityPacked(["uint256"], [DAPP_ID]))) % BigInt(OEV_AUCTION_LENGTH_SECONDS)
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
    return keccak256(
        solidityPacked(
            ["uint256", "uint256", "uint32", "uint32"],
            [OEV_AUCTIONS_MAJOR_VERSION, DAPP_ID, OEV_AUCTION_LENGTH_SECONDS, signedDataTimestampCutoff]
        )
    );
};

const getBidDetails = (liquidatorAddress) => {
    const nonce = ethers.hexlify(ethers.randomBytes(32));
    return ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [liquidatorAddress, nonce]);
};

const performOevUpdateAndLiquidation = async (
    awardedSignature,
    signedDataTimestampCutoff,
    priceUpdateDetails,
    liquidationParams
) => {
    const liquidator = new Contract(
        deployments.OevLiquidator,
        LIQUIDATOR_ABI,
        targetNetworkWallet
    );

    // Create the nested tuple structure that matches the Solidity structs
    const params = [
        signedDataTimestampCutoff,
        awardedSignature,
        parseEther(BID_AMOUNT),
        [
            priceUpdateDetails,
            [
                liquidationParams.collateralAsset,
                liquidationParams.debtAsset,
                liquidationParams.userToLiquidate,
                liquidationParams.debtToCover
            ]
        ]
    ];

    console.log("Performing Oracle update and liquidation...");
    const updateTx = await liquidator.payBidAndUpdateFeed(params, {
        value: parseEther(BID_AMOUNT)
    });
    
    await updateTx.wait();
    console.log("Oracle update and liquidation performed:", updateTx.hash);
    return updateTx;
};

const reportFulfillment = async (updateTx, bidTopic, bidDetails, bidId) => {
    const OevAuctionHouseArtifact = await hre.artifacts.readArtifact("OevAuctionHouse");
    const OevAuctionHouse = new Contract(
        api3Contracts.deploymentAddresses.OevAuctionHouse["4913"],
        OevAuctionHouseArtifact.abi,
        oevNetworkWallet
    );
    const bidDetailsHash = keccak256(bidDetails);

    const reportTx = await OevAuctionHouse.reportFulfillment(
        bidTopic,
        bidDetailsHash,
        updateTx.hash
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
            await new Promise((r) => setTimeout(r, 100));
        }
    });

    return confirmedFulfillmentTx;
};

const placeBid = async () => {
    // Initialize contracts
    const lendingPool = new Contract(
        process.env.LENDING_POOL_ADDRESS,
        LENDING_POOL_ABI,
        targetNetworkWallet
    );

    // Check if position is liquidatable
    console.log("Checking if position is liquidatable...");
    const isLiquidatable = await checkHealthFactor(lendingPool, userToLiquidate);
    
    if (!isLiquidatable) {
        console.log("Position is not liquidatable. Aborting...");
        return;
    }

    console.log("Position is liquidatable. Proceeding with bid...");

    // Get OEV signed data
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
    const bidDetails = getBidDetails(deployments.OevLiquidator);

    console.log("Placing bid with the following details:");
    console.log("Bid Topic:", bidTopic);
    console.log("Bid Details:", bidDetails);
    console.log("Current Timestamp:", Math.floor(Date.now() / 1000));
    console.log("Signed Data Timestamp Cutoff:", signedDataTimestampCutoff);
    console.log("Next Bidding Phase End Timestamp:", nextBiddingPhaseEndTimestamp);

    // Place bid
    const placedbidTx = await OevAuctionHouse.placeBidWithExpiration(
        bidTopic,
        parseInt(targetChainId),
        parseEther(BID_AMOUNT),
        bidDetails,
        MaxUint256,
        MaxUint256,
        nextBiddingPhaseEndTimestamp
    );
    
    console.log("Bid placed:", placedbidTx.hash);

    const bidId = keccak256(
        solidityPacked(
            ["address", "bytes32", "bytes32"],
            [
                oevNetworkWallet.address,
                bidTopic,
                keccak256(bidDetails),
            ]
        )
    );

    // Wait for bid to be awarded
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
            await new Promise((r) => setTimeout(r, 100));
        }
    });
    
    // Prepare liquidation parameters
    const liquidationParams = {
        collateralAsset: process.env.TOKEN_TO_RECEIVE,
        debtAsset: process.env.TOKEN_TO_REPAY_ADDRESS,
        userToLiquidate: userToLiquidate,
        debtToCover: MaxUint256
    };

    // Perform OEV update and liquidation
    const updateTx = await performOevUpdateAndLiquidation(
        awardedSignature,
        signedDataTimestampCutoff,
        priceUpdateDetails,
        liquidationParams
    );

    // Report fulfillment
    await reportFulfillment(updateTx, bidTopic, bidDetails, bidId);
};

// Run the script
placeBid().catch(console.error);