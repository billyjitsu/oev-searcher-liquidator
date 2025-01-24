# OEV Searcher Starter

>   An Example project to demonstrate how to use the OEV Network to place bids on dAPI IDs and then update dAPIs for the dAPP ID using the awarded signature from the OEV Network.

## Instructions

### Install dependencies

- Create a `.env` file similar to `example.env`. The scripts work with mantle mainnet by default, but you can change the network to any of the networks supported by the [API3 Market](market.api3.org).

```bash
yarn
```
### Deploy the OevFeedUpdater contract

- Deploy a OevFeedUpdater contract on the target chain. The OevFeedUpdater contract is used to pay the bid, perform the oracle update and any other subsequent calls in a single transaction. You can use the `deploy-oevfeedupdater` script to deploy the contract.
```bash
yarn deploy-oevfeedupdater
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

### Place Bid and Update dAPI Proxy

- You can now place bid, retrieve the encoded signature and update the dAPI values for `dappID 1` [communal proxies](https://docs.api3.org/dapps/integration/contract-integration.html#api3readerproxyv1) using the `submit-bid-update` script. The script also reports the fulfillment of the oracle update which is required to release the collateral.

```bash
yarn submit-bid-update
```

- The script fetches the OEV encoded values and signatures from the [public OEV endpoints](https://docs.api3.org/oev-searchers/in-depth/dapis/#oev-endpoints) for the `ETH/USD` dAPI, it then proceeds to place a bid of `0.01` MNT for the recurring `dAPP ID 1` auction round on mantle. Upon winning in the auction round, the script fetches the awarded signature and uses the signature and OEV encoded values to update the dAPP's `ETH/USD` dAPI. 

- You can change the bid amount, dAPI Name via the CLI. For example to update the [BTC/USD dAPI](https://market.api3.org/mantle/btc-usd) on Mantle mainnet with a bid amount of `0.1` MNT, you can run the following command:

```
BID_AMOUNT=0.1 DAPI_NAME="BTC/USD" yarn submit-bid-update
```

Note: Make sure the OevFeedUpdater contract is deployed on the target chain before running the script.