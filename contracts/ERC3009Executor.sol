// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IERC3009 {
    function transferWithAuthorization(
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

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract ERC3009Executor is EIP712 {
    using ECDSA for bytes32;

    // errors
    error UnsupportedToken(address token);
    error InvalidRecipient(address recipient);
    error InvalidZeroValue();
    error InvalidAuthRecipient(address expected, address actual);
    error ExpiredOrNotYetValid();
    error BundleSigMismatch();
    error BundleExpired();
    error PaymentAlreadyUsed(bytes32 paymentId);
    error UnderReceived();

    // state
    address public immutable USDT;
    address public immutable USDC;
    address public immutable JPYC;
    address public immutable feeTreasury;

    uint16 private constant OPERATOR_BPS    = 1_000;   // 10%
    uint16 private constant BPS_DENOMINATOR = 10_000;

    mapping(bytes32 => bool) public usedPaymentId;

    bytes32 private constant BUNDLE_TYPEHASH = keccak256(
        "Bundle(address payer,address token,address recipient,uint256 mainAmount,uint256 feeAmount,bytes32 paymentId,uint256 deadline)"
    );

    // 痩せたイベント
    event Executed(
        bytes32 indexed paymentId,
        address indexed token,
        address indexed payer,
        address recipient,
        address facilitator
    );

    // reentrancy
    uint256 private _locked = 1;
    modifier nonReentrant() {
        require(_locked == 1, "REENTRANCY");
        _locked = 2;
        _;
        _locked = 1;
    }

    modifier onlySupported(address token) {
        if (token != USDT && token != USDC && token != JPYC) {
            revert UnsupportedToken(token);
        }
        _;
    }

    struct Authorization {
        address from;
        address to;
        uint256 value;       // main + fee
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct Input {
        bytes32 paymentId;
        address token;
        address recipient;
        Authorization auth;
        uint256 mainAmount;
        uint256 feeAmount;
        uint256 deadline;
        bytes bundleSig;
    }

    constructor(
        address _usdt,
        address _usdc,
        address _jpyc,
        address _feeTreasury
    ) EIP712("ERC3009Executor", "1") {
        USDT = _usdt;
        USDC = _usdc;
        JPYC = _jpyc;
        feeTreasury = _feeTreasury;
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "SAFE_TRANSFER_FAIL");
    }

    function _pull3009(address token, Authorization calldata a) private {
        IERC3009(token).transferWithAuthorization(
            a.from,
            a.to,
            a.value,
            a.validAfter,
            a.validBefore,
            a.nonce,
            a.v,
            a.r,
            a.s
        );
    }

    function executeAuthorizedTransfer(Input calldata p)
        external
        nonReentrant
        onlySupported(p.token)
    {
        // paymentId 一意性
        if (usedPaymentId[p.paymentId]) {
            revert PaymentAlreadyUsed(p.paymentId);
        }
        usedPaymentId[p.paymentId] = true;

        // 軽い検証
        if (p.recipient == address(0)) revert InvalidRecipient(p.recipient);
        if (p.mainAmount == 0 || p.feeAmount == 0) revert InvalidZeroValue();

        // EIP-712 検証
        {
            bytes32 structHash = keccak256(
                abi.encode(
                    BUNDLE_TYPEHASH,
                    p.auth.from,
                    p.token,
                    p.recipient,
                    p.mainAmount,
                    p.feeAmount,
                    p.paymentId,
                    p.deadline
                )
            );
            bytes32 digest = _hashTypedDataV4(structHash);
            address signer = digest.recover(p.bundleSig);
            if (signer != p.auth.from) revert BundleSigMismatch();
            if (block.timestamp > p.deadline) revert BundleExpired();
        }

        // 3009 側チェック
        address self = address(this);
        if (p.auth.to != self) revert InvalidAuthRecipient(self, p.auth.to);

        uint256 nowTs = block.timestamp;
        if (nowTs < p.auth.validAfter || nowTs >= p.auth.validBefore) {
            revert ExpiredOrNotYetValid();
        }

        // main + fee == auth.value
        if (p.auth.value != p.mainAmount + p.feeAmount) {
            revert InvalidZeroValue();
        }

        IERC20 erc20 = IERC20(p.token);
        uint256 bal0 = erc20.balanceOf(self);

        // 合計 pull
        _pull3009(p.token, p.auth);

        // 受領確認
        uint256 delta = erc20.balanceOf(self) - bal0;
        if (delta < p.auth.value) revert UnderReceived();

        // 本体を送る
        _safeTransfer(p.token, p.recipient, p.mainAmount);

        // fee を分配
        uint256 operatorAmount    = (p.feeAmount * OPERATOR_BPS) / BPS_DENOMINATOR;
        uint256 facilitatorAmount = p.feeAmount - operatorAmount;

        if (operatorAmount > 0) {
            _safeTransfer(p.token, feeTreasury, operatorAmount);
        }
        if (facilitatorAmount > 0) {
            _safeTransfer(p.token, msg.sender, facilitatorAmount);
        }

        // 痩せたイベント
        emit Executed(
            p.paymentId,
            p.token,
            p.auth.from,
            p.recipient,
            msg.sender
        );
    }
}
