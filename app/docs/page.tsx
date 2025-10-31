export default function DocsOverviewPage() {
  return (
    <article className="space-y-6 text-sm leading-relaxed text-muted-foreground">
      <header className="space-y-2 text-foreground">
        <h1 className="text-2xl font-semibold">Paylancer ドキュメント</h1>
        <p>
          Paylancer は ERC-3009 送金チケットを作成・保存し、ファシリテーターが安全に実行するためのワークフローを提供します。
          このセクションでは埋め込み方法とファシリテーター向け運用ガイドをまとめています。
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">ガイド構成</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>埋め込みガイド</strong> …… iframe と React コンポーネントで Paylancer フォームを再利用する方法。
          </li>
          <li>
            <strong>ファシリテーター向けガイド</strong> …… 署名済みジョブの取得・ウォレット実行・API 呼び出しフローの説明。
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">前提環境</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Paylancer をデプロイし、`NEXT_PUBLIC_EXECUTOR_CONTRACT_ADDRESS` などの必須環境変数を設定していること。</li>
          <li>Supabase のサービスロールキー（Service Role Key）を API から利用可能にしていること。</li>
          <li>WalletConnect の Project ID を用意し、ウォレット接続が行える状態になっていること。</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">参考リンク</h2>
        <p>
          実装例や型定義を確認したい場合は、`components/create-job-form.tsx` や `lib/jobs/executor.ts` をご覧ください。
          これらを基に独自の UI や実行ロジックを構築できます。
        </p>
      </section>
    </article>
  );
}
