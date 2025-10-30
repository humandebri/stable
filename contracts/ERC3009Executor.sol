// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ERC3009Executor
 * @notice Executes a pair of EIP-3009 `receiveWithAuthorization` calls (main transfer + fee)
 *         in a single transaction while restricting supported tokens to a curated list.
 *         Optionally attaches an x402 `paymentId` so that off-chain HTTP flows can map
 *         on-chain executions back to the originating request.
 */
contract ERC3009Executor {
    /// @dev Minimal interface for tokens that implement EIP-3009.
    interface IERC3009 {
        function receiveWithAuthorization(
            address from,
            address to,
            uint256 value,
            uint256 validAfter,
            uint256 validBefore,
            bytes32 nonce,
            uint8 v,
            bytes32 r,
            bytes32 s
        ) external;
    }

    error UnsupportedToken(address token);
    error InvalidFeePayer(address expected, address actual);

    address public immutable USDT;
    address public immutable USDC;
    address public immutable JPYC;

    /**
     * @dev x402 対応: paymentId を indexed で event に乗せる。
     *      paymentId を利用しない場合は 0x00..00 を渡せばよい。
     */
    event Executed(
        bytes32 indexed paymentId,
        address indexed token,
        address indexed payer,
        address recipient,
        address facilitator,
        uint256 mainAmount,
        uint256 feeAmount,
        bytes32 mainNonce,
        bytes32 feeNonce
    );

    constructor(address _usdt, address _usdc, address _jpyc) {
        USDT = _usdt;
        USDC = _usdc;
        JPYC = _jpyc;
    }

    modifier onlySupported(address token) {
        if (token != USDT && token != USDC && token != JPYC) {
            revert UnsupportedToken(token);
        }
        _;
    }

    /**
     * @notice Execute the main transfer and fee transfer in a single call.
     * @dev `feeFrom` は利用者 (mainFrom) と一致していることを期待する。
     * @param paymentId Optional x402 identifier to correlate HTTP 402 flows with on-chain execution.
     * @param token Supported token address (USDT/USDC/JPYC).
     * @param mainStruct Parameters for the primary transfer.
     * @param feeStruct Parameters for the facilitator fee transfer.
     */
    function executeAuthorizedTransfer(
        bytes32 paymentId,
        address token,
        MainAuthorization calldata mainStruct,
        FeeAuthorization calldata feeStruct
    ) external onlySupported(token) {
        if (feeStruct.from != mainStruct.from) {
            revert InvalidFeePayer(mainStruct.from, feeStruct.from);
        }

        IERC3009(token).receiveWithAuthorization(
            mainStruct.from,
            mainStruct.to,
            mainStruct.value,
            mainStruct.validAfter,
            mainStruct.validBefore,
            mainStruct.nonce,
            mainStruct.v,
            mainStruct.r,
            mainStruct.s
        );

        IERC3009(token).receiveWithAuthorization(
            feeStruct.from,
            feeStruct.to,
            feeStruct.value,
            feeStruct.validAfter,
            feeStruct.validBefore,
            feeStruct.nonce,
            feeStruct.v,
            feeStruct.r,
            feeStruct.s
        );

        emit Executed(
            paymentId,
            token,
            mainStruct.from,
            mainStruct.to,
            msg.sender,
            mainStruct.value,
            feeStruct.value,
            mainStruct.nonce,
            feeStruct.nonce
        );
    }

    /**
     * @notice Authorization parameters for the main transfer.
     * Signature (v, r, s) follows the EIP-3009 `receiveWithAuthorization` spec.
     */
    struct MainAuthorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    /**
     * @notice Authorization parameters for the facilitator fee transfer.
     * `from` must be the same as the main authorization signer.
     */
    struct FeeAuthorization {
        address from;
        address to;
        uint256 value;
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    // TODO: Foundry/Hardhat テストを追加し、主な成功/失敗パターンを検証する。
}
