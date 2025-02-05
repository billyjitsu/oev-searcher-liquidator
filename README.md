# OEV Searcher Liquidator

>   An Example project to demonstrate how to use the OEV Network to place bids on dAPI IDs and then update dAPIs for the dAPP ID using the awarded signature from the OEV Network and finally performe a liquidation.

## Instructions

### Install dependencies

- Create a `.env` file similar to `example.env`. The scripts work with mantle mainnet by default, but you can change the network to any of the networks supported by the [API3 Market](market.api3.org).

```bash
yarn
```
### Bridge and Deposit

- Bridge ETH to the OEV Network using the [OEV Network bridge](https://oev-network.bridge.caldera.xyz/)

- After Bridging ETH to the OEV Network, deposit ETH to the `OevAuctionHouse` contract. Use the `deposit-collateral` script to deposit ETH to the contract.

```bash
yarn deposit-collateral
```

Note: The script deposits `0.0001` ETH to the contract. You can change the amount by passing the `AMOUNT` environment variable.

```
AMOUNT=0.1 yarn deposit-collateral 
```
### Deploy the OevFeedUpdater contract

- Deploy a OevFeedUpdater contract on the target chain. The OevFeedUpdater contract is used to pay the bid, perform the oracle update and any other subsequent calls in a single transaction. You can use the `deploy-oevfeedupdater` script to deploy the contract.
```bash
yarn deploy-oevfeedupdater
```

### Place Bid and Update dAPI Proxy

- You can now place bid, retrieve the encoded signature and update the dAPI values for `dappID 1` [communal proxies](https://docs.api3.org/dapps/integration/contract-integration.html#api3readerproxyv1) using the `submit-bid-update` script. The script also reports the fulfillment of the oracle update which is required to release the collateral.

```bash
yarn submit-bid-update
```

- The script fetches the OEV encoded values and signatures from the [public OEV endpoints](https://docs.api3.org/oev-searchers/in-depth/dapis/#oev-endpoints) for the `ETH/USD` dAPI, it then proceeds to place a bid of `0.01` MNT for the [recurring](https://docs.api3.org/oev-searchers/in-depth/oev-searching.html#auction-schedule) `dappID 1` auction round on mantle. Upon winning in the auction round, the script fetches the awarded signature and uses the awarded signature and OEV encoded values to update the `dappID 1` `ETH/USD` dAPI. 

- You can change the bid amount, dAPI Name via the CLI. For example to update `dappID 1` [BTC/USD dAPI](https://market.api3.org/mantle/btc-usd) on Mantle mainnet with a bid amount of `0.1` MNT, you can run the following command:

```
BID_AMOUNT=0.1 DAPI_NAME="BTC/USD" yarn submit-bid-update
```

Note: Make sure the OevFeedUpdater contract is deployed on the target chain before running the script.

### Deploy the OevFeedLiquidator contract

- Deploy a OevFeedLiquidator contract on the target chain. The OevFeedLiquidator contract is used to pay the bid, perform the oracle update like the previous oevfeedupdater, but also adds in the ability to liquidate the position and any other subsequent calls in a single transaction. You can use the `deploy-oevfeedliquidator` script to deploy the contract.
```bash
yarn deploy-oevfeedliquidator
```

### Fund the liquidator contract

- In this example, in order to liquidate the postion, we must pay back the debt allowed with the debt token  itself.  Because the the contract will be doing the liquidation, the contract must hold teh tokens.  Running `fund-liquidator` to transfer the debt tokens from the EOA wallet to the liquidator contract.
```bash
yarn fund-liquidator
```

### Update the Mock Price and the Oracle Source (demonstration only)

- During a demonstration or testing of OEV liquidations.  It's impossible to set a live price feed to a value that can set off a liquidation.  In order to show how it works, we use a "Mocked" oracle and we set the value in order to perform the liquidation. In the script, set the value you want to update the oracle to push to the lend dapp by running `updateMockPriceandOracle`.  This price can be updated multiple times for your testing needs. * You must be the Owner/deployer of the Mock Price contracts. (.env COLLATERAL_MOCKPROXY_ADDRESS). We must also change the oracle source in our example for our borrow/lending dapp to reflect our new mock price.  As the owner of the borrow/lending dapp, we have the ability to switch where our dapps gets their data from.  Running `updateMockPriceandOracle` will update the oracle source for your feed for that specific adaptor (.env file COLLATERAL_ASSET_PROXY to COLLATERAL_MOCKPROXY_ADDRESS)
```bash
yarn updateMockPriceandOracle
```

### Place Bid, Update dAPI Proxy and Liquidate
- Putting it all together
- Requirements - liquidator contract deployed, funded, and position liquidable

- You can now place bid, retrieve the encoded signature and update the dAPI values for `dappID 1` [communal proxies](https://docs.api3.org/dapps/integration/contract-integration.html#api3readerproxyv1) using the `submit-bid-update-liquidate` script. The script also reports the fulfillment of the oracle update which is required to release the collateral.

```bash
yarn submit-bid-update-liquidate
```

- The script fetches the OEV encoded values and signatures from the [public OEV endpoints](https://docs.api3.org/oev-searchers/in-depth/dapis/#oev-endpoints) for the `ETH/USD` dAPI, it then proceeds to place a bid of `0.01` MNT for the [recurring](https://docs.api3.org/oev-searchers/in-depth/oev-searching.html#auction-schedule) `dappID 1` auction round on mantle. Upon winning in the auction round, the script fetches the awarded signature and uses the awarded signature and OEV encoded values to update the `dappID 1` `ETH/USD` dAPI.

- Once the value is updated, it will perform the liquidation set in the parameters of the .env file and script.  The liquidator contract will update the pricefeed and do a callback.  During the callback, the liquidation will be performed. 

- You can change the bid amount, dAPI Name via the CLI. For example to update `dappID 1` [BTC/USD dAPI](https://market.api3.org/mantle/btc-usd) on Mantle mainnet with a bid amount of `0.1` MNT, you can run the following command:

```
BID_AMOUNT=0.1 DAPI_NAME="BTC/USD" yarn submit-bid-update-liquidate
```

Note: Make sure the OevFeedLiquidator contract is deployed on the target chain and funded before running the script.