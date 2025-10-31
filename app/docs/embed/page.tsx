import Link from "next/link";

const PAYLANCER_BASE_URL =
  process.env.NEXT_PUBLIC_PAYLANCER_BASE_URL ?? "https://your-paylancer-domain";

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

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">CORS / セキュリティ</h2>
        <p className="text-sm text-muted-foreground">
          iframe 埋め込みの場合、ジョブ作成 API は Paylancer サーバー内で完結します。
          埋め込み元アプリは UI だけを提供し、ジョブ保存には <code>X-API-Key</code> ヘッダーによる認証が利用されます。
        </p>
        <p className="text-sm text-muted-foreground">
          直接 React コンポーネントとして利用したい場合は、<Link href="/jobs" className="underline">/jobs</Link> のコードを参考に <code>CreateJobForm</code> コンポーネントをプロジェクトへ移植してください。将来的には npm パッケージとして提供予定です。
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">API から直接ジョブを作成したい場合</h2>
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

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground">APIキーの発行と無効化</h2>
        <p className="text-sm text-muted-foreground">
          Paylancer の API キーは管理者が <code>INTERNAL_API_SECRET</code> を使って発行します。下記コマンドを実行すると、新しいキー（<code>plk_*</code>）が払い出されます。
        </p>
        <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
          <code>{ADMIN_CREATE_KEY_SNIPPET}</code>
        </pre>
        <p className="text-xs text-muted-foreground">
          レスポンスに含まれる <code>key</code> は一度しか表示されません。安全な場所に保管し、通常の API 呼び出しでは <code>X-API-Key</code> ヘッダーに設定してください。キーを無効化したい場合は <code>PATCH /api/admin/api-keys/&lt;id&gt;</code> に <code>{'{ "action": "revoke" }'}</code> を送信します。
        </p>
      </section>
    </main>
  );
}
