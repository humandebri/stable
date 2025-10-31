import Link from "next/link";

const PAYLANCER_BASE_URL =
  process.env.NEXT_PUBLIC_PAYLANCER_BASE_URL ?? "https://your-paylancer-domain";

export default function FacilitatorDocsPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-muted-foreground">
      <header className="space-y-2 text-foreground">
        <h1 className="text-2xl font-semibold">ファシリテーター運用ガイド</h1>
        <p>
          ジョブの取得からウォレット実行、結果のフィードバックまでの基本フローをまとめています。
          独自の運用ツールや Bot を構築する際に参考にしてください。
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">ジョブ取得 API</h2>
        <p>
          `/api/dev/api-keys` で発行した `plk_*` キーを使用し、`/api/jobs?status=pending` などのエンドポイントから実行待ちのジョブを取得します。
          レスポンスには main/bundle 署名が含まれるため、実行前に期限（`valid_before` と `bundle_deadline`）を必ず確認してください。
        </p>
        <pre className="overflow-auto rounded-lg border border-border/60 bg-muted/40 p-4 text-xs leading-relaxed text-foreground">
{`curl -X GET ${PAYLANCER_BASE_URL}/api/jobs?status=pending \\
  -H 'X-API-Key: plk_example'`}
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">ウォレット実行フロー</h2>
        <p>
          UI 実装例は <Link href="/dev/api-keys" className="underline">/dev/api-keys</Link> で確認できます。
          サーバーサイドや Bot で実行する場合は `lib/jobs/executor.ts` を参考にし、`executeAuthorizedTransfer` を呼び出してください。
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>main と bundle の期限・支払い ID を検証し、既に使用済みでないことを確認する。</li>
          <li>ウォレットで `executeAuthorizedTransfer` の引数を組み立て、トランザクションをブロードキャストする。</li>
          <li>結果に応じて `/api/jobs/[id]` を `processing` → `executed` / `failed` へ更新し、Tx ハッシュや失敗理由を記録する。</li>
        </ol>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">運用上の注意点</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>API キーはウォレット署名で発行・無効化できます。漏洩した場合はすぐに revoke してください。</li>
          <li>複数のファシリテーターを分散配置し、単一ノード停止時でもジョブが滞らない構成を推奨します。</li>
          <li>期限切れジョブや失敗ジョブは適宜クリーンアップし、再実行可否を明確にしておくと混乱を防げます。</li>
        </ul>
      </section>
    </article>
  );
}
