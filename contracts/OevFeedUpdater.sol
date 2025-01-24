// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {Ownable} from "./vendor/openzeppelin/contracts@4.9.5/access/Ownable.sol";
import {IApi3ServerV1OevExtension} from "@api3/contracts/api3-server-v1/interfaces/IApi3ServerV1OevExtension.sol";
import {IApi3ServerV1OevExtensionOevBidPayer} from "@api3/contracts/api3-server-v1/interfaces/IApi3ServerV1OevExtensionOevBidPayer.sol";

contract OevFeedUpdater is Ownable, IApi3ServerV1OevExtensionOevBidPayer {
    uint256 public immutable dappId;
    IApi3ServerV1OevExtension public immutable api3ServerV1OevExtension;

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
    }

    constructor(uint256 _dappId, address _api3ServerV1OevExtension) Ownable() {
        dappId = _dappId;
        api3ServerV1OevExtension = IApi3ServerV1OevExtension(_api3ServerV1OevExtension);
    }

    /// @notice Pays the OEV bid and updates the data feeds
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

    /// @notice Callback triggered by calling `payOevBid` on the OEV server extension. Updates data feeds,
    /// and pays back the payment amount owed for the OEV bid. You can also perform additional actions here like
    /// performing liquidations, doing flash loans, etc before paying the bid amount.
    function onOevBidPayment(
        uint256 bidAmount,
        bytes calldata _data
    ) external override returns (bytes32) {
        require(msg.sender == address(api3ServerV1OevExtension), "Unauthorized");

        PayOevBidCallbackData memory data = abi.decode(
            _data,
            (PayOevBidCallbackData)
        );
        api3ServerV1OevExtension.updateDappOevDataFeed(dappId, data.signedDataArray);
        address(api3ServerV1OevExtension).call{value: bidAmount}("");

        return OEV_BID_PAYMENT_CALLBACK_SUCCESS;
    }

    receive() external payable {}
}
