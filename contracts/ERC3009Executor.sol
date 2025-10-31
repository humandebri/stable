// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ERC3009Executor (single-authorization + EIP-712 bundle)
 * @notice
 * - ユーザーは transferWithAuthorization を「main + fee の合計額」で1回だけ署名する
 * - 宛先は必ずこのコントラクト (to = address(this))
 * - 実行時に EIP-712 バンドル署名で recipient / mainAmount / feeAmount / token / paymentId を検証
 * - コントラクトが main を recipient に、fee を 10% treasury / 90% facilitator に分配する
 */
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract ERC3009Executor is EIP712 {
    using ECDSA for bytes32;

    // --- 3009 インタフェース（transferWithAuthorization版） ---
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

    // --- errors ---
    error UnsupportedToken(address token);
    error InvalidRecipient(address recipient);
    error InvalidZeroValue();
    error InvalidAuthRecipient(address expected, address actual);
    error ExpiredOrNotYetValid();
    error BundleSigMismatch();
    error BundleExpired();
    error PaymentAlreadyUsed(bytes32 paymentId);
    error UnderReceived();
    error FeeDistributionFailed();

    // --- state ---
    address public immutable USDT;
    address public immutable USDC;
    address public immutable JPYC;
    address public immutable feeTreasury;

    // fee = 10% 運営, 90% facilitator
    uint16 private constant OPERATOR_BPS    = 1_000;  // 10%
    uint16 private constant FACILITATOR_BPS = 9_000;  // 90%
    uint16 private constant BPS_DENOMINATOR = 10_000;

    // x402 的に paymentId で一意化
    mapping(bytes32 => bool) public usedPaymentId;

    // --- EIP-712 typehash ---
    // payer が token の mainAmount + feeAmount をこのコントラクトに既に渡していることを前提に、
    // どこに・いくら・どの支払いとして出すかをロックする
    bytes32 private constant BUNDLE_TYPEHASH = keccak256(
        "Bundle(address payer,address token,address recipient,uint256 mainAmount,uint256 feeAmount,bytes32 paymentId,uint256 deadline)"
    );

    // --- events ---
    event Executed(
        bytes32 indexed paymentId,
        address indexed token,
        address indexed payer,
        address recipient,
        address facilitator,
        uint256 mainAmount,
        uint256 feeAmount,
        uint256 operatorAmount,
        uint256 facilitatorAmount,
        bytes32 authNonce
    );

    // --- minimal reentrancy guard ---
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

    // --- 3009 auth struct ---
    struct Authorization {
        address from;
        address to;          // 必ず address(this)
        uint256 value;       // main + fee
        uint256 validAfter;
        uint256 validBefore;
        bytes32 nonce;
        uint8 v;
        bytes32 r;
        bytes32 s;
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

    // --- safeTransfer (USDT対応) ---
    function _safeTransfer(address token, address to, uint256 value) private {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, value));
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "SAFE_TRANSFER_FAIL");
    }

    // --- EIP-712 bundle verify ---
    function _verifyBundle(
        address payer,
        address token,
        address recipient,
        uint256 mainAmount,
        uint256 feeAmount,
        bytes32 paymentId,
        uint256 deadline,
        bytes calldata bundleSig
    ) internal view {
        bytes32 structHash = keccak256(
            abi.encode(
                BUNDLE_TYPEHASH,
                payer,
                token,
                recipient,
                mainAmount,
                feeAmount,
                paymentId,
                deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = digest.recover(bundleSig);
        if (signer != payer) {
            revert BundleSigMismatch();
        }
        if (block.timestamp > deadline) {
            revert BundleExpired();
        }
    }

    /**
     * @notice 合計1本の3009 + 1本のEIP-712で実行するやつ
     * @param paymentId x402のトレース用。ユニークで渡して
     * @param token USDT/USDC/JPYCのどれか
     * @param recipient ユーザーが最終的に受け取りたいアドレス（EIP-712内でも検証する）
     * @param auth 合計額(main+fee)のtransferWithAuthorization
     * @param mainAmount recipientに送る額
     * @param feeAmount facilitator/運営で分ける手数料額
     * @param deadline EIP-712バンドルの有効期限
     * @param bundleSig ユーザーのEIP-712署名
     */
    function executeAuthorizedTransfer(
        bytes32 paymentId,
        address token,
        address recipient,
        Authorization calldata auth,
        uint256 mainAmount,
        uint256 feeAmount,
        uint256 deadline,
        bytes calldata bundleSig
    ) external nonReentrant onlySupported(token) {
        // 0. paymentId の再利用防止
        if (usedPaymentId[paymentId]) {
            revert PaymentAlreadyUsed(paymentId);
        }
        usedPaymentId[paymentId] = true;

        if (recipient == address(0)) {
            revert InvalidRecipient(recipient);
        }
        if (mainAmount == 0) {
            revert InvalidZeroValue();
        }
        if (feeAmount == 0) {
            // 手数料0を許すならここ消す
            revert InvalidZeroValue();
        }

        // 1. 署名された宛先が本当にこのコントラクトかどうか
        address self = address(this);
        if (auth.to != self) {
            revert InvalidAuthRecipient(self, auth.to);
        }

        // 2. 期限チェック（トークン側もやるが早めに弾く）
        uint256 nowTs = block.timestamp;
        if (nowTs < auth.validAfter || nowTs >= auth.validBefore) {
            revert ExpiredOrNotYetValid();
        }

        // 3. EIP-712で中身をロック（recipientや金額が改ざんされてないか）
        _verifyBundle(
            auth.from,
            token,
            recipient,
            mainAmount,
            feeAmount,
            paymentId,
            deadline,
            bundleSig
        );

        // 4. 合計額が一致しているか (main + fee == auth.value)
        //    ここがズレていたら実行しない
        if (auth.value != mainAmount + feeAmount) {
            revert InvalidZeroValue(); // 適当なerrorを使い回してるが本番なら別errorにして
        }

        IERC3009 t3009 = IERC3009(token);
        IERC20 erc20 = IERC20(token);

        // 5. 受領前残高
        uint256 bal0 = erc20.balanceOf(self);

        // 6. 3009を1本だけ実行（合計額をpull）
        t3009.transferWithAuthorization(
            auth.from,
            self,
            auth.value,
            auth.validAfter,
            auth.validBefore,
            auth.nonce,
            auth.v,
            auth.r,
            auth.s
        );

        // 7. fee-on-transfer対策で受領後残高をチェック
        uint256 delta = erc20.balanceOf(self) - bal0;
        if (delta < auth.value) {
            // deflationary/token-taxで想定より減ってるなら止める
            revert UnderReceived();
        }

        // 8. 本体分をrecipientへ
        _safeTransfer(token, recipient, mainAmount);

        // 9. feeを分配（10%運営 / 90%実行者）
        uint256 operatorAmount    = (feeAmount * OPERATOR_BPS) / BPS_DENOMINATOR;
        uint256 facilitatorAmount = feeAmount - operatorAmount;

        if (operatorAmount > 0) {
            _safeTransfer(token, feeTreasury, operatorAmount);
        }
        if (facilitatorAmount > 0) {
            _safeTransfer(token, msg.sender, facilitatorAmount);
        }

        emit Executed(
            paymentId,
            token,
            auth.from,
            recipient,
            msg.sender,
            mainAmount,
            feeAmount,
            operatorAmount,
            facilitatorAmount,
            auth.nonce
        );
    }
}
