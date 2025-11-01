import Link from "next/link";

const PAYLANCER_BASE_URL = (process.env.NEXT_PUBLIC_PAYLANCER_BASE_URL ?? "").replace(/\/$/, "");

export default function FacilitatorDocsPage() {
  return (
    <article className="space-y-8 text-sm leading-relaxed text-muted-foreground">
      <header className="space-y-3 text-foreground">
        <h1 className="text-3xl font-semibold tracking-tight">ファシリテーター運用ガイド</h1>
        <p>
          ここでは Paylancer ファシリテーターが担う「ジョブ取得 → 署名検証 → 実行 → ステータス更新」までの一連の手順と、
          監視・ログ・BAN といった運用まわりの設計事項を整理します。Bot 実装や運用 SOP のベースとして活用してください。
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">前提と用語</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-foreground">ジョブ</strong> … `/api/jobs` に保存される EIP-3009 署名セット。
            `payment_id` と `bundle_deadline` を持ち、処理ステータス（`pending` / `processing` / `executed` など）を管理します。
          </li>
          <li>
            <strong className="text-foreground">予約（reservation）</strong> … ジョブ登録時に自動作成される `job_reservations` レコード。
            `payment_id` と `authorization.nonce` を一意に確保し、重複実行を防ぎます。
          </li>
          <li>
            <strong className="text-foreground">ファシリテーター</strong> … ジョブをポーリングし、署名検証後に
            `executeAuthorizedTransfer` を送信するウォレット（または Bot）。`/api/jobs/[id]` に対する PATCH を通じて進捗を報告します。
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">認証と権限</h2>
        <p>
          すべてのファシリテーター API は署名済みの API キーが必須です。キーは{" "}
          <Link href="/dev/api-keys" className="underline">/dev/api-keys</Link> または
          <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">/api/dev/api-keys</code> から発行・再発行できます。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>`X-API-Key` ヘッダーに `plk_*` を設定することで `/api/jobs` GET/PATCH が利用可能。</li>
          <li>環境によっては `x-internal-api-key` ヘッダーを要求する保守 API があるため、キーの保管は厳重に。</li>
          <li>API キー漏洩時は即座に revoke し、ログから不正利用を遡及確認する運用体制を用意してください。</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">ジョブ取得（GET /api/jobs）</h2>
        <p>
          初期ポーリングでは `status=pending` を指定し、実行待ちのジョブをバッチで取得するのが基本パターンです。
          limit は最大 200 件まで指定可能です。
        </p>
        <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
{`curl -X GET "${PAYLANCER_BASE_URL}/api/jobs?status=pending&limit=50" \\
  -H 'X-API-Key: plk_your_key'`}
        </pre>
        <p>レスポンス例（主要フィールドのみ抜粋）:</p>
        <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
{`{
  "jobs": [
    {
      "id": "09a7d...",
      "chain_id": 137,
      "token": "0x2791...",
      "payment_id": "0xa1b2...",
      "status": "pending",
      "authorization_payload": {
        "from": "0xPayer",
        "to": "0xExecutor",
        "value": "1100000",
        "validAfter": "1717485000",
        "validBefore": "1717488600",
        "nonce": "0xNonce...",
        "signature": "0x..."
      },
      "bundle": {
        "payer": "0xPayer",
        "token": "0x2791...",
        "recipient": "0xRecipient",
        "mainAmount": "1000000",
        "feeAmount": "100000",
        "paymentId": "0xa1b2...",
        "deadline": "1717488300"
      },
      "bundle_signature": "0x...",
      "expires_at": "2024-06-04T08:10:00.000Z",
      "bundle_deadline_at": "2024-06-04T08:05:00.000Z"
    }
  ]
}`}
        </pre>
        <p>
          取得後は `payment_id` をキーに自前のワークスペースへ一次保存しておくと、重複検知や
          失敗時の再試行判断に役立ちます。`job_reservations` テーブルとも照合可能です。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">署名・ホワイトリスト検証</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            サーバーはジョブ保存時に <code>viem.verifyTypedData</code> で bundle 署名を検証済みですが、
            ファシリテーターでも <code>lib/jobs/executor.ts</code> の <code>normalizeJobExecution</code> を使って再検証できます。
          </li>
          <li>
            <code>lib/tokens.ts</code> に定義されたサポート済みチェーン・トークン・金額レンジ（min/max）を超過したジョブは登録時点で弾かれます。
            Bot 実装でも同じ制約を再チェックしておくと安心です。
          </li>
          <li>
            <code>validAfter &lt;= now &lt; validBefore</code> と <code>now &lt; bundleDeadline</code> を超過したジョブはサーバーが 400 で遮断します。
            ポーリング側でも期限切れを検知して早期に `failed` マークする運用が望まれます。
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">予約と重複防止</h2>
        <p>
          ジョブ作成時に `job_reservations` テーブルへ以下の情報が挿入されます。
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>`payment_id` と `authorization_nonce` は一意制約付き。重複登録時は 409 が返ります。</li>
          <li>`status` は `pending` → (`completed` | `failed` | `expired`) のライフサイクル。成功保存時に `completed` へ更新されます。</li>
          <li>
            `expires_at` は <code>min(valid_before, bundle_deadline)</code> で算出。定期バッチ（Supabase スケジュール）で
            `expires_at &lt; now` を削除し、監査ログに残しておく運用が推奨です。
          </li>
        </ul>
        <p>
          ファシリテーターは予約テーブルを直接操作する必要はありませんが、失敗レスポンスで
          `bundle signature verification failed` 等が返った場合、予約が `failed` として残るため後続調査に利用できます。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">実行ステップ（PATCH /api/jobs/[id]）</h2>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>ロック取得:</strong> 実行前にジョブを自分のものにするため、`status=processing` を送信します。
            <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
{`curl -X PATCH ${PAYLANCER_BASE_URL}/api/jobs/{jobId} \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: plk_your_key' \\
  -d '{
    "status": "processing",
    "facilitator": "0xYourWorkerAddress"
  }'`}
            </pre>
            指定したアドレスは `taken_by` として保存され、他ファシリテーターからの重複実行を防ぎます。
          </li>
          <li>
            <strong>トランザクション送信:</strong> `lib/jobs/executor.ts` の <code>normalizeJobExecution</code> → <code>validateJobBeforeExecution</code> →
            <code>executeAuthorizedTransfer</code> の順に呼び出すと、安全に calldata を構築できます。
            下記は Bot からジョブを実行する際のサンプルです。
            <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
{`import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import {
  normalizeJobExecution,
  validateJobBeforeExecution,
  buildExecuteArgs
} from "@/lib/jobs/executor";
import { erc3009ExecutorAbi } from "@/lib/abi/erc3009Executor";

const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS as \`0x\${string}\`;

export async function execute(job) {
  const walletClient = createWalletClient({
    chain: polygon,
    transport: http(process.env.RPC_URL),
    account: privateKeyToAccount(process.env.WALLET_KEY!)
  });
  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(process.env.RPC_URL)
  });

  const normalized = normalizeJobExecution(job);
  validateJobBeforeExecution(normalized);
  const args = buildExecuteArgs(normalized);

  await publicClient.simulateContract({
    account: walletClient.account.address,
    address: EXECUTOR_ADDRESS,
    abi: erc3009ExecutorAbi,
    functionName: "executeAuthorizedTransfer",
    args
  });

  const hash = await walletClient.writeContract({
    account: walletClient.account,
    address: EXECUTOR_ADDRESS,
    abi: erc3009ExecutorAbi,
    functionName: "executeAuthorizedTransfer",
    args
  });

  return hash;
}`}
            </pre>
            logger を仕込んだバージョンは <code>executeJobWithLogging</code> を利用すると簡潔に書けます。
          </li>
          <li>
            <strong>Python からの実行例:</strong> viem 相当の処理を Python で行う場合は <code>web3.py</code> と
            <code>eth-account</code> を利用します。以下の例では JSON で受け取ったジョブを正規化し、署名検証後にトランザクションを送出します。
            <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
{`import os
import time
import json
from web3 import Web3

EXECUTOR_ADDRESS = Web3.to_checksum_address(os.environ["EXECUTOR_ADDRESS"])
RPC_URL = os.environ["RPC_URL"]
PRIVATE_KEY = os.environ["PRIVATE_KEY"]

w3 = Web3(Web3.HTTPProvider(RPC_URL))
ACCOUNT = w3.eth.account.from_key(PRIVATE_KEY)


def normalize_job(job):
    \"\"\"lib/jobs/executor.ts と同等の正規化処理（抜粋）。\"\"\"
    token = Web3.to_checksum_address(job["token"])
    recipient = Web3.to_checksum_address(job.get("recipient") or job["bundle"]["recipient"])

    auth = job["authorization_payload"]
    auth_from = Web3.to_checksum_address(auth["from"])
    auth_to = Web3.to_checksum_address(auth["to"])

    payment_id = job.get("payment_id") or job["bundle"]["paymentId"]
    if not payment_id.startswith("0x") or len(payment_id) != 66:
        raise ValueError("invalid paymentId")

    return {
        "token": token,
        "recipient": recipient,
        "payment_id": payment_id,
        "authorization": {
            "from": auth_from,
            "to": auth_to,
            "value": int(auth["value"]),
            "valid_after": int(auth["validAfter"]),
            "valid_before": int(auth["validBefore"]),
            "nonce": auth["nonce"],
            "v": auth.get("v"),
            "r": auth.get("r"),
            "s": auth.get("s"),
            "signature": auth.get("signature"),
        },
        "main_amount": int(job.get("main_amount") or job["bundle"]["mainAmount"]),
        "fee_amount": int(job.get("fee_amount") or job["bundle"]["feeAmount"]),
        "deadline": int(job.get("bundle_deadline") or job["bundle"]["deadline"]),
        "bundle_signature": job.get("bundle_signature") or job["bundle"]["signature"],
    }


def validate(normalized):
    now = int(time.time())
    auth = normalized["authorization"]
    if now >= auth["valid_before"]:
        raise ValueError("authorization expired")
    if now >= normalized["deadline"]:
        raise ValueError("bundle deadline passed")
    if auth["valid_after"] > now:
        raise ValueError("authorization not yet valid")
    if normalized["main_amount"] <= 0 or normalized["fee_amount"] <= 0:
        raise ValueError("amounts must be positive")
    if auth["value"] != normalized["main_amount"] + normalized["fee_amount"]:
        raise ValueError("value mismatch")


def build_execute_args(normalized):
    auth = normalized["authorization"]
    # signature から r, s, v を生成
    if auth["signature"] and (not auth["r"] or not auth["s"] or auth["v"] is None):
        sig_bytes = bytes.fromhex(auth["signature"][2:])
        auth["r"] = Web3.to_hex(sig_bytes[0:32])
        auth["s"] = Web3.to_hex(sig_bytes[32:64])
        v = sig_bytes[64]
        if v < 27:
            v += 27
        auth["v"] = v

    params = {
        "paymentId": normalized["payment_id"],
        "token": normalized["token"],
        "recipient": normalized["recipient"],
        "auth": (
            auth["from"],
            auth["to"],
            auth["value"],
            auth["valid_after"],
            auth["valid_before"],
            auth["nonce"],
            auth["v"],
            auth["r"],
            auth["s"],
        ),
        "mainAmount": normalized["main_amount"],
        "feeAmount": normalized["fee_amount"],
        "deadline": normalized["deadline"],
        "bundleSig": normalized["bundle_signature"],
    }

    return params


def execute_job(job_json: str):
    job = json.loads(job_json)
    normalized = normalize_job(job)
    validate(normalized)
    params = build_execute_args(normalized)

    contract = w3.eth.contract(
        address=EXECUTOR_ADDRESS,
        abi=json.load(open("lib/abi/erc3009Executor.json"))
    )
    txn = contract.functions.executeAuthorizedTransfer(params)

    gas_estimate = txn.estimate_gas({"from": ACCOUNT.address})
    tx = txn.build_transaction({
        "from": ACCOUNT.address,
        "nonce": w3.eth.get_transaction_count(ACCOUNT.address),
        "gas": gas_estimate,
        "maxFeePerGas": w3.to_wei("40", "gwei"),
        "maxPriorityFeePerGas": w3.to_wei("2", "gwei"),
        "chainId": w3.eth.chain_id,
    })

    signed = ACCOUNT.sign_transaction(tx)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
    return tx_hash.hex()`}
            </pre>
            Web3.py は BigInt を自動で処理するため、数値化の際は Python の int を使用します。ABI JSON は `lib/abi/erc3009Executor.json` をそのまま利用できます。
          </li>
          <li>
            <strong>結果報告:</strong> 成功時は `status=executed`、失敗時は `status=failed` + `failReason` を送信します。
            <div className="space-y-3">
              <p className="font-semibold text-foreground">成功例</p>
              <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
{`{
  "status": "executed",
  "executedTxHash": "0xTransactionHash",
  "facilitator": "0xYourWorkerAddress"
}`}
              </pre>
              <p className="font-semibold text-foreground">失敗例</p>
              <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
{`{
  "status": "failed",
  "failReason": "allowance check reverted"
}`}
              </pre>
            </div>
            失敗時は `executed_tx_hash` / `executed_at` がクリアされ、`fail_reason` にメッセージが残ります。
          </li>
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">エラーとレスポンスコード</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>400</strong>: 署名や金額、トークンがポリシー外。`error` メッセージをそのままログに出すと解析が容易です。</li>
          <li><strong>409</strong>: `payment_id` / `nonce` 重複、またはステータス競合（例: 他ファシリテーターが先に `processing` 済み）。</li>
          <li><strong>500</strong>: Supabase 障害やネットワーク不調など内部エラー。数秒おいて再試行し、過剰なリトライを避けるバックオフを推奨します。</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">監視・ログ設計</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>ジョブ進捗ごとに `job_id` / `payment_id` / `wallet_address` / `facilitator` を含む実行ログを保存し、監査 trail として活用。</li>
        </ul>
      </section>

    </article>
  );
}
