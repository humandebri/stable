import Link from "next/link";

const PAYLANCER_BASE_URL =
  process.env.NEXT_PUBLIC_PAYLANCER_BASE_URL ?? "https://your-paylancer-domainn";

const IFRAME_SNIPPET = `import React from "react";

export function PaylancerTicketEmbed() {
  return (
    <iframe
      src="${PAYLANCER_BASE_URL}/embed/ticket"
      title="Paylancer Ticket"
      width="100%"
      height="720"
      style={{ border: "0", borderRadius: "16px" }}
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

export default function EmbedDocsPage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
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
          任意のコンポーネント内に以下を貼り付けるだけで、Paylancer のフォームが表示されます。
        </p>
        <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
          <code>{IFRAME_SNIPPET}</code>
        </pre>
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
          より高度なカスタマイズを行う場合は、<code>CreateJobForm</code>（`components/create-job-form.tsx`）をそのまま import してご利用ください。署名〜API保存まで一式揃っています。
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
    </main>
  );
}
