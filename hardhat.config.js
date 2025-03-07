require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

const {
  api3Chains: { hardhatConfig },
} = require('@api3/dapi-management');

module.exports = {
  networks: {
    ...hardhatConfig.networks(),
    targetNetwork: {
      url: process.env.TARGET_NETWORK_RPC_URL,
      accounts: {
        mnemonic: process.env.MNEMONIC
      }
    }
  },
  solidity: {
    version: '0.8.17',
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  sourcify: {
    enabled: false
  }
};