// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IApi3ServerV1OevExtension} from "@api3/contracts/api3-server-v1/interfaces/IApi3ServerV1OevExtension.sol";
import {IApi3ServerV1OevExtensionOevBidPayer} from "@api3/contracts/api3-server-v1/interfaces/IApi3ServerV1OevExtensionOevBidPayer.sol";
import {ILendingPool} from "./vendor/protocol-v2/contracts/interfaces/ILendingPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ILendingPoolAddressesProvider} from "./vendor/protocol-v2/contracts/interfaces/ILendingPoolAddressesProvider.sol";
import {IFlashLoanReceiver} from "./vendor/protocol-v2/contracts/flashloan/interfaces/IFlashLoanReceiver.sol";

// Modify contract declaration to implement IFlashLoanReceiver
contract OevLiquidator is Ownable, IApi3ServerV1OevExtensionOevBidPayer, IFlashLoanReceiver {
    uint256 public immutable dappId;
    IApi3ServerV1OevExtension public immutable api3ServerV1OevExtension;
    ILendingPool public immutable lendingPool;
    ILendingPoolAddressesProvider public immutable ADDRESSES_PROVIDER;

    bytes32 private constant OEV_BID_PAYMENT_CALLBACK_SUCCESS =
        keccak256("Api3ServerV1OevExtensionOevBidPayer.onOevBidPayment");

    struct PayBidAndUpdateFeeds {
        uint32 signedDataTimestampCutoff;
        bytes signature;
        uint256 bidAmount;
        PayOevBidCallbackData payOevBidCallbackData;
    }

    struct PayOevBidCallbackData {
        bytes[] signedDataArray;
        LiquidationParams liquidationParams;
    }

    struct LiquidationParams {
        address collateralAsset;
        address debtAsset;
        address userToLiquidate;
        uint256 debtToCover;
    }

    struct FlashLoanParams {
        address[] assets;
        uint256[] amounts;
        uint256[] modes;  // 0 = no debt, 1 = stable, 2 = variable
        address onBehalfOf;
        bytes params;
        uint16 referralCode;
    }

    event LiquidationExecuted(
        address indexed user,
        address indexed collateralAsset,
        address indexed debtAsset,
        uint256 debtCovered,
        uint256 collateralReceived
    );

    constructor(
        uint256 _dappId,
        address _api3ServerV1OevExtension,
        address _lendingPool,
        address _addressesProvider
    ) Ownable() {
        dappId = _dappId;
        api3ServerV1OevExtension = IApi3ServerV1OevExtension(_api3ServerV1OevExtension);
        lendingPool = ILendingPool(_lendingPool);
        ADDRESSES_PROVIDER = ILendingPoolAddressesProvider(_addressesProvider);
    }

    function payBidAndUpdateFeed(
        PayBidAndUpdateFeeds calldata params
    ) external payable {
        require(msg.value == params.bidAmount, "Incorrect bid amount");
        api3ServerV1OevExtension.payOevBid(
            dappId,
            params.bidAmount,
            params.signedDataTimestampCutoff,
            params.signature,
            abi.encode(params.payOevBidCallbackData)
        );
    }

    function onOevBidPayment(
        uint256 bidAmount,
        bytes calldata _data
    ) external override returns (bytes32) {
        require(msg.sender == address(api3ServerV1OevExtension), "Unauthorized");

        PayOevBidCallbackData memory data = abi.decode(_data, (PayOevBidCallbackData));

        // First update the price feed
        api3ServerV1OevExtension.updateDappOevDataFeed(dappId, data.signedDataArray);

        // Then attempt the liquidation
        LiquidationParams memory params = data.liquidationParams;
        
        // Check if position is liquidatable
        (,,,,,uint256 healthFactor) = lendingPool.getUserAccountData(params.userToLiquidate);
        require(healthFactor < 1e18, "Position not liquidatable");

        // Setup flash loan parameters
        address[] memory assets = new address[](1);
        assets[0] = params.debtAsset;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = params.debtToCover;
        uint256[] memory modes = new uint256[](1);
        modes[0] = 0; // no debt mode

        // Execute flash loan
        lendingPool.flashLoan(
            address(this),
            assets,
            amounts,
            modes,
            address(this),
            abi.encode(params), // Pass liquidation params to executeOperation
            0 // referral code
        );

        // Pay the bid amount back to the OEV extension
        (bool success, ) = address(api3ServerV1OevExtension).call{value: bidAmount}("");
        require(success, "Bid payment failed");

        return OEV_BID_PAYMENT_CALLBACK_SUCCESS;
    }

    function executeFlashLoan(FlashLoanParams calldata params) external onlyOwner {
        lendingPool.flashLoan(
            address(this),
            params.assets,
            params.amounts,
            params.modes,
            params.onBehalfOf,
            params.params,
            params.referralCode
        );
    }

    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        require(msg.sender == address(lendingPool), "Invalid caller");
        require(initiator == address(this), "Invalid initiator");

        // Decode params if needed and perform your liquidation logic here
        
        // Approve repayment of flash loan
        for (uint256 i = 0; i < assets.length; i++) {
            uint256 amountToRepay = amounts[i] + premiums[i];
            IERC20(assets[i]).approve(address(lendingPool), amountToRepay);
        }

        return true;
    }

    function ADDRESSES_PROVIDER_ADDRESS() external view override returns (ILendingPoolAddressesProvider) {
        return ADDRESSES_PROVIDER;
    }

    function LENDING_POOL() external view override returns (ILendingPool) {
        return lendingPool;
    }

    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }

    function withdrawETH(uint256 amount) external onlyOwner {
        payable(owner()).transfer(amount);
    }

    receive() external payable {}
}