import Link from "next/link";

import { EmbedPreview } from "@/components/docs/embed-preview";

const PAYLANCER_BASE_URL = (process.env.NEXT_PUBLIC_PAYLANCER_BASE_URL ?? "").replace(/\/$/, "");

const IFRAME_SNIPPET = `import React, { useEffect, useRef, useState } from "react";

export function PaylancerTicketEmbed() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(720);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type !== "paylancer:height") return;
      if (typeof event.data.height === "number") {
        setHeight(event.data.height);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src="${PAYLANCER_BASE_URL}/embed/ticket"
      title="Paylancer Ticket"
      width="100%"
      style={{ border: "0", borderRadius: "16px", height }}
      allow="clipboard-write"
    />
  );
}`;

const IFRAME_PREFILL_SNIPPET = `import React from "react";

export function PaylancerTicketEmbedPrefilled() {
  return (
    <iframe
      src="${PAYLANCER_BASE_URL}/embed/ticket?token=0xToken...&recipient=0xRecipient...&amount=120&fee=0.5"
      title="Paylancer Ticket (Prefilled)"
      width="100%"
      height="640"
      style={{ border: "0", borderRadius: "16px" }}
      scrolling="no"
      allow="clipboard-write"
    />
  );
}`;

const REACT_COMPONENT_SNIPPET = `import React, { useState } from "react";
import {
  WagmiProvider,
  createConfig,
  http,
  useAccount,
  useConnect,
  useDisconnect,
  useSignMessage
} from "wagmi";
import { injected } from "wagmi/connectors";
import { mainnet } from "wagmi/chains";

const config = createConfig({
  chains: [mainnet],
  connectors: [injected()],
  transports: { [mainnet.id]: http() }
});

function SignOnlyWidget() {
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [message, setMessage] = useState("Paylancer: authorize payment");
  const [signature, setSignature] = useState<string | null>(null);

  const handleSign = async () => {
    const sig = await signMessageAsync({ message });
    setSignature(sig);
  };

  return (
    <div className="rounded-lg border p-4">
      {!isConnected ? (
        <button onClick={() => connect()} className="rounded bg-blue-600 px-4 py-2 text-white">
          Connect Wallet
        </button>
      ) : (
        <>
          <p className="mb-2 text-sm text-gray-600">Connected: {address}</p>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            className="mb-2 w-full rounded border p-2 text-sm"
          />
          <button onClick={handleSign} className="rounded bg-green-600 px-4 py-2 text-white">
            Sign Message
          </button>
          <button onClick={() => disconnect()} className="ml-2 rounded border px-4 py-2 text-sm">
            Disconnect
          </button>
          {signature ? (
            <div className="mt-3 break-all text-xs">
              <strong>Signature:</strong> {signature}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function PaylancerSigner() {
  return (
    <WagmiProvider config={config}>
      <SignOnlyWidget />
    </WagmiProvider>
  );
}
`;

const API_SNIPPET = `curl -X POST ${PAYLANCER_BASE_URL}/api/jobs \\
  -H 'Content-Type: application/json' \\
  -H 'X-API-Key: <YOUR_PAYLANCER_API_KEY>' \\
  -d '{
    "chainId": 137,
    "token": "0xToken...",
    "recipient": "0xRecipient...",
    "mainAmount": "1000000",
    "feeAmount": "10000",
    "authorization": { /* transferWithAuthorization payload */ },
    "bundle": { /* bundle struct */ },
    "bundleSignature": "0x...",
    "bundleDeadline": "1730262000"
  }'`;

const FLOW_STEPS = [
  "ユーザーのウォレットで transferWithAuthorization（合計額）に署名する",
  "同じウォレットで bundle 署名を取得する",
  "署名データを Paylancer API に POST してジョブとして保存する"
];

const ADMIN_CREATE_KEY_SNIPPET = `curl -X POST ${PAYLANCER_BASE_URL}/api/admin/api-keys \\
  -H 'Content-Type: application/json' \\
  -H 'X-Internal-API-Key: <INTERNAL_API_SECRET>' \\
  -d '{ "name": "staging backend" }'`;

const STATUS_POLL_SNIPPET = `import { useEffect, useState } from "react";

export function usePaymentStatus(paymentId) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!paymentId) return;

    let active = true;
    const controller = new AbortController();

    const tick = async () => {
      try {
        const res = await fetch(
          \`/api/jobs/status?paymentId=\${paymentId}\`,
          {
            headers: { 'X-API-Key': '<YOUR_PAYLANCER_API_KEY>' },
            signal: controller.signal
          }
        );
        if (!res.ok) throw new Error('ステータス取得に失敗しました');
        const data = await res.json();
        if (!active) return;
        setStatus(data.job.status);
        if (data.job.status !== 'pending' && data.job.status !== 'processing') {
          return; // 完了したらポーリング終了
        }
        timeout = window.setTimeout(tick, 5000);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        timeout = window.setTimeout(tick, 10000);
      }
    };

    let timeout = window.setTimeout(tick, 0);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [paymentId]);

  return { status, error };
}`;

const IFRAME_RESIZE_SNIPPET = `import { useEffect, useRef, useState } from "react";

export function PaylancerTicketEmbed() {
  const iframeRef = useRef(null);
  const [height, setHeight] = useState(720);

  useEffect(() => {
    const listener = (event) => {
      if (event.data?.type !== "paylancer:height") return;
      setHeight(event.data.height);
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src="${PAYLANCER_BASE_URL}/embed/ticket"
      style={{ width: "100%", border: 0, height }}
      allow="clipboard-write"
    />
  );
}`;

export default function EmbedDocsPage() {
  return (
    <article className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">埋め込みガイド</h1>
        <p className="text-sm text-muted-foreground">
          Paylancer の送金チケット作成 UI は <code>/embed/ticket</code> にホストされています。
          React / Next.js / 任意の SPA から数行で埋め込めるよう、シンプルな iframe 形式を提供しています。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">最小コード例</h2>
        <p className="text-sm text-muted-foreground">
          任意のコンポーネント内に以下を貼り付けるだけで、Paylancer のフォームが表示されます。iframe 内には自動でリサイズイベントを送信するため、ホスト側では高さだけを更新すれば大丈夫です。
        </p>
        <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
          <code>{IFRAME_SNIPPET}</code>
        </pre>
        <p className="text-sm text-muted-foreground">
          埋め込み URL にクエリパラメータを付与すると、フォームの初期値を設定しつつ該当フィールドをロックできます。
          例: <code>?token=0x...&recipient=0x...&amount=100&fee=0.5</code>
        </p>
        <ul className="list-disc space-y-1 pl-6 text-sm text-muted-foreground">
          <li><code>token</code>: トークンコントラクトアドレス（指定するとトークン選択をロック）</li>
          <li><code>recipient</code>: 受取人アドレス（`0x` 形式、40文字）</li>
          <li><code>amount</code>: 送金金額（数値文字列）</li>
          <li><code>fee</code>: ファシリテーター手数料（数値文字列）</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          ご利用いただけるトークンはチェーン毎に Paylancer がホワイトリスト登録したものだけです。対応外のアドレスを指定すると、iframe 内で警告が表示され保存処理は進みません。現在のチェーンで許可されているトークンは `/jobs` 画面のドロップダウンに表示される一覧をご確認ください。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">埋め込みプレビュー</h2>
        <p className="text-sm text-muted-foreground">
          実際に iframe を配置すると以下のように表示されます。デザイン調整の参考としてご覧ください（サンプルのため本番ドメインに置き換えてご利用ください）。
        </p>

        <div className="overflow-hidden rounded-lg border border-border bg-white shadow-sm">
          <EmbedPreview
            src={`${PAYLANCER_BASE_URL}/embed/ticket?token=0xE7C3D8C9a439feDe00D2600032D5dB0Be71C3c29&recipient=0x59eD56DF718Ba10212B853237259B51007F80915&amount=150&fee=0.75`}
            title="Paylancer Ticket Preview (Prefilled)"
            className="w-full"
          />
        </div>

      </section>


      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">React コンポーネントとして利用する</h2>
        <p className="text-sm text-muted-foreground">
          Paylancer のフォームは `CreateJobForm` をそのまま利用することで React 内に組み込めます。
          必要な wagmi/RainbowKit ラッパーと環境変数を用意したうえで、以下のように import してください。
        </p>
        <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
          <code>{REACT_COMPONENT_SNIPPET}</code>
        </pre>
        <p className="text-xs text-muted-foreground">
          依存関係: <code>wagmi</code>（v2）。必要に応じてチェーンやメッセージ内容を書き換えてください。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">CORS / セキュリティ</h2>
        <p className="text-sm text-muted-foreground">
          iframe 埋め込みでは Paylancer 側の API が処理を完結させるため、ホスト側は `X-API-Key` ヘッダーだけ設定すれば安全に利用できます。
        </p>
        <p className="text-sm text-muted-foreground">
          より高度なカスタマイズを行う場合は、<code>CreateJobForm</code>（`components/create-job-form`）をそのまま import してご利用ください。署名〜API保存まで一式揃っています。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">ステータス確認 API</h2>
        <p className="text-sm text-muted-foreground">
          トランザクション完了を検知したい場合は、ジョブ作成時に取得した `paymentId` または `job.id` を使って
          `/api/jobs/status` をポーリングしてください。レスポンスには最新ステータスと直近のイベントが含まれます。
        </p>
        <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
{`curl -X GET ${PAYLANCER_BASE_URL}/api/jobs/status?paymentId=0x1234... \
  -H 'X-API-Key: <YOUR_PAYLANCER_API_KEY>'`}
        </pre>
        <p className="text-xs text-muted-foreground">
          ステータスが `executed` になったタイミングで完了として扱えます。`events` 配列には最新 3 件の `job_events`
          が格納されるため、失敗理由や再試行可否の判断にも利用できます。
        </p>
        <p className="text-sm text-muted-foreground">
          React で簡易的にポーリングする場合は、以下の Hook サンプルを参考にしてください。
        </p>
        <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
          <code>{STATUS_POLL_SNIPPET}</code>
        </pre>
        <p className="text-xs text-muted-foreground">
          `status` が `executed` / `failed` など終端ステータスになった時点でポーリングが終了します。`error` は通信失敗時に表示用として利用できます。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">iframe の高さを自動調整する</h2>
        <p className="text-sm text-muted-foreground">
          `/embed/ticket` はフォームの高さが変化するたびに <code>postMessage</code> でホストページへ通知します。
          以下のようにメッセージを受け取り、`iframe` の高さを更新すると固定値を決めずに埋め込めます。
        </p>
        <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
          <code>{IFRAME_RESIZE_SNIPPET}</code>
        </pre>
        <p className="text-xs text-muted-foreground">
          受信するメッセージの `type` は常に <code>paylancer:height</code> です。`height` の単位は px なので、そのまま `style.height`
          に適用できます。
        </p>
      </section>

      <section className="space-y-4">
        <h1 className="text-3xl font-semibold text-foreground">API から直接ジョブを作成したい場合</h1>
        <ol className="space-y-2 text-sm text-muted-foreground">
          {FLOW_STEPS.map((step, index) => (
            <li key={step}>
              <span className="mr-2 font-semibold text-foreground/80">{index + 1}.</span>
              {step}
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted-foreground">
          署名データの生成には Paylancer の <code>lib/eip3009.ts</code> ヘルパーを利用するのが最も安全です。サーバーサイドで行う場合も同じ手順で typed data を組み立て、ウォレットに署名させてください。
        </p>

        <h3 className="text-lg font-semibold text-foreground">HTTP リクエスト例</h3>
        <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
          <code>{API_SNIPPET}</code>
        </pre>
        <p className="text-xs text-muted-foreground">
          <strong>X-API-Key</strong> には発行した Paylancer API key（例: <code>plk_*</code>）を指定してください。リクエスト本文は `/jobs` ページで保存される JSON と同じ構造です。
        </p>
      </section>
    </article>
  );
}
