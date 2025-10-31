# 3009-Based Facilitated Payments dApp 設計（x402対応・トークン固定版）

## 1. 目的

既存の **EIP-3009 対応トークン（USDT / USDC / JPYC）** を使って、

1. ユーザーが「あとで誰かに実行してもらう送金指示（Authorization）」をウォレットで署名して発行できて、
2. ネットワーク上の**どのファシリテーターでも**その指示を拾って実行できて、
3. 実行したファシリテーターが**同じトークンで手数料を自動回収できて**、
4. さらにHTTP 402 (x402)で出てきた**paymentIdとオンチェーン実行をひも付けられる**

ようにする。

鍵はユーザーのウォレットに残す。ファシリテーターには「条件付きで実行可能なジョブのデータ」だけを渡す。つまり“鍵の貸し出し”ではなく“実行可能な署名ジョブの配布”。

---

## 2. 全体アーキテクチャ

```text
[User Wallet (WC / Injected)]
    │ ① EIP-712署名 (main)
    │ ② EIP-712署名 (fee)
    ▼
[Frontend dApp]
    │ ③ Authorization JSON生成
    │    + x402があれば paymentId も付与
    │ ④ Job Store に pending で保存
    ▼
[Job Store (Supabase / API / on-chain registry)]
    ▲                         │
    │ ⑦ 実行結果を書き戻す     │ ⑤ pending ジョブを取得
    │                         ▼
                 [Facilitator UI / Service]
                         │ ⑥ Executor 呼び出し
                         ▼
   [ERC-3009 Executor (USDT/USDC/JPYC固定, x402 paymentId対応)]
                         │
                         ▼
         [USDT / USDC / JPYC トークンコントラクト]
```

※ x402を使う場合は、HTTPで402を返したサーバが`paymentId`を払い出している想定。dAppがそれをJSONに乗せ、ExecutorがEventに出すことで、HTTPとオンチェーンを1:1で結ぶ。

---

## 3. コントラクト設計

### 3.1 役割

* ユーザーが署名した **本体の3009** と **手数料の3009** を **同一トランザクションで**実行する
* 実行者（=ファシリテーター, `msg.sender`）をイベントに残す
* 対応トークンを **USDT / USDC / JPYC** に**固定**する
* x402が投げた`paymentId`を**任意で受け取ってEventに出す**（なければ0でいい）

### 3.2 Solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

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

contract ERC3009Executor {
    address public immutable USDT;
    address public immutable USDC;
    address public immutable JPYC;

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
        require(
            token == USDT || token == USDC || token == JPYC,
            "unsupported token"
        );
        _;
    }

    function executeAuthorizedTransfer(
        bytes32 paymentId,
        address token,
        // main
        address mainFrom,
        address mainTo,
        uint256 mainAmount,
        uint256 mainValidAfter,
        uint256 mainValidBefore,
        bytes32 mainNonce,
        uint8 mainV,
        bytes32 mainR,
        bytes32 mainS,
        // fee (to = このコントラクト固定で署名してもらう)
        uint256 feeAmount,
        uint256 feeValidAfter,
        uint256 feeValidBefore,
        bytes32 feeNonce,
        uint8 feeV,
        bytes32 feeR,
        bytes32 feeS
    ) external onlySupported(token) {
        // 1. 本体
        IERC3009(token).receiveWithAuthorization(
            mainFrom,
            mainTo,
            mainAmount,
            mainValidAfter,
            mainValidBefore,
            mainNonce,
            mainV,
            mainR,
            mainS
        );

        // 2. ユーザー→このコントラクト に fee を受ける
        IERC3009(token).receiveWithAuthorization(
            mainFrom,
            address(this), // ここがポイント
            feeAmount,
            feeValidAfter,
            feeValidBefore,
            feeNonce,
            feeV,
            feeR,
            feeS
        );

        // 3. すぐ実行者に流す
        // USDT/USDC/JPYCはだいたい標準ERC20互換でtransferある前提
        // （チェーンによりsafeTransferにしたければここ変える）
        (bool ok, ) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", msg.sender, feeAmount)
        );
        require(ok, "fee transfer failed");

        emit Executed(
            paymentId,
            token,
            mainFrom,
            mainTo,
            msg.sender,
            mainAmount,
            feeAmount,
            mainNonce,
            feeNonce
        );
    }
}


### 3.3 ポイント

* トークンは**アドレスを見て弾く**ので、怪しいERC-20での実行を防げる
* 「本体が成功してfeeだけ失敗」は一括revertで潰す（atomic）
* eventに `paymentId` / `msg.sender` / `nonce` を入れてるので、**オフチェーンでの後追い（x402側の「この請求は払われたか？」確認）が簡単**になる
* このコントラクト自体はバランスを持たないので、アップグレードしやすいし、監査ポイントも少ない

---

## 4. ユーザー側フロー（UI）

ウォレットは**すでに持ってる**想定なので、接続はWalletConnect + injectedで足りる。ユーザーには3009とかAuthorizationとか一切見せない。UIはshadcnで作る

### 4.1 ページ1：支払い指示を作る

表示するのはこれだけでいい：

* トークン選択：**USDT / USDC / JPYC**（この3つに固定）
* 送信先アドレス（or ラベル）
* 金額
* 実行者に払ってもいい手数料の上限（固定額でいい。%は後で）
* 有効期限（5分 / 30分 / 2時間）
* **(任意)** x402 Payment ID（HTTP 402を受けた人向け。普通は非表示でもいい）
* ボタン：「実行可能な支払い指示をつくる」

ユーザーに伝える文言は「今すぐ送金されるわけではありません。実行してくれるノードが現れたときに送金されます。」だけでいい。

### 4.2 ボタン押下後の裏側処理

1. UI入力を受ける

   * `token`（アドレス）
   * `to`
   * `amount`
   * `feeTo`（基本はdApp側であらかじめ用意した“fee受け取りアドレス”を入れる。ユーザーが自分で指定してもいい）
   * `feeAmount`
   * `validBefore = now + duration`
   * `x402PaymentId`（あれば）

2. `mainNonce` / `feeNonce` をランダム生成

3. ウォレットに **2回** EIP-712署名させる

   * 1回目：本体送金
   * 2回目：fee送金

4. 出来上がったJSONをJob Storeに `status = "pending"` で保存

例：

```json
{
  "network": "polygon-amoy",
  "token": "0xUSDC...",
  "status": "pending",
  "x402PaymentId": "0x0000000000000000000000000000000000000000000000000000000000000000",
  "main": {
    "from": "0xUser",
    "to": "0xRecipient",
    "value": "1000000",
    "validAfter": 0,
    "validBefore": 1730262000,
    "nonce": "0xabc...",
    "signature": "0x..."
  },
  "fee": {
    "from": "0xUser",
    "to": "0xFacilitator",
    "value": "10000",
    "validAfter": 0,
    "validBefore": 1730262000,
    "nonce": "0xdef...",
    "signature": "0x..."
  }
}
```

5. ユーザーには「待ち中」と表示

### 4.3 ページ2：送信済み一覧

テーブルでいい。列は最低限：

* 日時
* トークン
* 宛先
* 金額
* 手数料上限
* 状態（`pending` / `processing` / `executed` / `expired` / `failed`）
* （x402時）paymentId

---

## 5. ファシリテーター側フロー

ユーザー用とUIを分ける。ここはオペレーター画面。

### 5.1 Pending一覧

* token
* from
* to
* amount
* feeAmount
* validBefore
* x402PaymentId
* 実行ボタン

### 5.2 実行手順

1. Job Storeから`pending`を取得
2. **期限チェック**：`now < main.validBefore && now < fee.validBefore`
3. **トークンチェック**：`token in {USDT, USDC, JPYC}`
4. **シミュレーション（任意）**：`eth_call`でExecutor呼び出しをdry-run
5. 問題なければExecutorを実行

```ts
writeContract({
  address: EXECUTOR,
  abi: erc3009ExecutorAbi,
  functionName: "executeAuthorizedTransfer",
  args: [
    job.x402PaymentId ?? ZERO_32,
    job.token,
    // main
    job.main.from,
    job.main.to,
    job.main.value,
    job.main.validAfter,
    job.main.validBefore,
    job.main.nonce,
    ...splitSig(job.main.signature),
    // fee
    job.fee.to,
    job.fee.value,
    job.fee.validAfter,
    job.fee.validBefore,
    job.fee.nonce,
    ...splitSig(job.fee.signature),
  ],
});
```

6. Tx成功したらJob Storeに

   * `status = executed`
   * `executed_tx_hash = 0x...`
   * `executed_at = now()`
     を書く

7. x402の`paymentId`が入っていたら、そのIDをキーに**HTTP側に「paid」コールバック**する（ここだけはオフチェーン）

---

## 6. ストレージ層（Job Store）

最初はDBでいい。SQLはこうしておくと後でx402も拾いやすい。

```sql
create table jobs (
  id uuid primary key default gen_random_uuid(),
  network text not null, -- polygon, base, etc.
  token text not null,
  x402_payment_id text,  -- nullなら通常のdAppから
  main jsonb not null,
  fee jsonb not null,
  status text not null default 'pending', -- pending | processing | executed | expired | failed
  executed_tx_hash text,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);
```

期限切れはバッチで

```sql
update jobs
set status = 'expired'
where status = 'pending'
  and (main->>'validBefore')::bigint < extract(epoch from now());
```

みたいに落とせばいい（雑だけど十分）。

---

## 7. セキュリティ方針

1. **対応トークン固定**
   コントラクトでUSDT/USDC/JPYC以外はrevert。
   → 「変なERC-20にAuthorizationを書かされて実行された」を潰す。

2. **本体→feeの順番で固定**
   feeだけ通るのを防ぐ。atomicにする。

3. **ユーザー署名を改変しない**
   Executorは受け取って呼ぶだけ。署名はdAppで作る。それ以上の権限をコントラクトに持たせない。

4. **期限はUIとファシリテーターの両方で見る**
   UIだけに任せない。実行側でもrevert条件にしておく。

5. **オフチェーン失効を許す**
   ユーザーが「やっぱやめる」と言ったときはJob Storeで`status=cancelled`にすれば、ファシリテーターはそれを拾わない。オンチェーンの完全revokeは後回し。

6. **x402のIDはそのままイベントに載せるだけ**
   EVM内でx402の署名検証まではしない。これはガス的に後回しでいい。とにかく“どのHTTP請求とつながってるか”だけ取る。

---

## 8. x402 との接続ポイント（詳細）

* **HTTP 402を返すサービス**はこのフィールドを返す想定：

  ```json
  {
    "status": 402,
    "payment_required": {
      "scheme": "x402",
      "network": "polygon-amoy",
      "token": "0xUSDC...",
      "amount": "1000000",
      "paymentId": "0x1234..."
    }
  }
  ```
* dAppはこれを受け取ったら、その`paymentId`をそのまま**ジョブJSONの `x402PaymentId` に入れる**
* ファシリテーターはそれをそのままExecutorに投げる
* ExecutorはEventで吐く
* HTTP側はEventを見て「このpaymentIdは払われた」とマークする

これだけで「x402にも初めから対応してます」と言える。

---

## 9. 将来的な拡張（今やらない）

* **バッチABI**：同一ユーザーからの複数Authorizationをまとめて1回のfeeにする
* **異トークンfee**：本体USDCだけどfeeはJPYC、みたいなのを許す
* **オンチェーンジョブボード**：Job StoreをEVM上に出して完全分散にする
* **オンチェーンrevoke**：Authorizationを後から無効化するための共通関数を作る
* **ファシリテーターランキング**：誰がどれだけ実行したかをオンチェーンから集計して出す

---

## 10. まとめ

* 中心は「EIP-3009を2回呼ぶExecutorを1本置く」だけ。トークン側を一切いじらない。
* dAppは「支払い指示アプリ」として出す。ユーザーに暗号用語は見せない。
* ファシリテーターは別UI。pendingを拾って実行して、手数料をもらう。
* Job Storeはオフチェーンでいい。オンチェーンに残すのはExecutorのEventだけ。
* x402は`paymentId`をJSONとEventに通すだけで初期対応できる。後からHTTPゲートウェイを増やせる。