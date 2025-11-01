export default function WhitepaperPage() {
  return (
    <article className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-12 text-base leading-relaxed text-muted-foreground">
      <header className="space-y-4 text-foreground">
        <h1 className="text-4xl font-semibold tracking-tight">Paylancer ホワイトペーパー</h1>
        <p>
          Paylancer は「あとで確実に支払う」というユーザーの意思をトークン化し、誰でも安全に扱える形で流通させるための仕組みです。
          本稿では、内蔵する技術の細部ではなく、<strong>どのような仕組みで動き、利用者と運営者がどのようなメリットを得られるか</strong>
          を丁寧に説明します。
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">1. 背景と課題</h2>
        <p>
          従来のファシリテーターは、特定のチームや企業が中央集権的に運営するケースがほとんどでした。運営が活動を停止した瞬間に、
          利用者が預けていた支払い依頼は宙に浮き、誰も実行しないまま期限を迎えるリスクが常につきまといます。
          「このサービスが明日も続いているか」という不確実性が、利用者にとって最大の不安要素でした。
        </p>
        <p>
          さらに、多くのファシリテーターは安定した報酬モデルを持たず、ボランティア的に運用されていました。
          ガス代や作業コストに見合った対価が得られないと、継続的にサービスを提供するのは困難です。
        </p>
        <p>
          Paylancer はこの二つの課題――<strong>単一運営に依存しない継続性</strong> と
          <strong>ファシリテーターにとって持続可能な報酬構造</strong>――を両立させることを目標に設計されています。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">2. Paylancer の仕組み</h2>
        <p className="font-semibold text-foreground">(1) ユーザーが支払い指示を作成する</p>
        <p>
          ユーザーは Paylancer のフォームや埋め込みウィジェットを通じて、支払いたい金額・受取人・手数料などを入力します。
          ウォレットはその内容を「あとで送金して良い」という承認（Authorization）として署名し、Paylancer に送信します。
          この承認は EIP-3009 という標準に基づくもので、トークン保有者があらかじめ移転に同意したことを暗号署名として示し、後から別の人が実行できる仕組みです。
          鍵を預ける必要がなく、署名が有効な期間や支払い ID を細かく指定できるため、ユーザーにとって安全で柔軟な「あと払い」が実現します。
        </p>
        <p className="font-semibold text-foreground">(2) Paylancer が予約として保護し、検証ログを残す</p>
        <p>
          署名を受け取った Paylancer は、支払い ID（paymentId）と署名のノンスを「予約テーブル」に記録します。
          ここで二重登録があれば即座に 409 エラーを返し、既存ジョブとの重複を未然に防止します。さらに、予約には有効期限と実行期限があり、
          期限が切れたものは自動的に `expired` として処理されます。照合の過程はすべて `job_events` に記録され、「いつ誰の支払いがどの理由で受理/却下されたか」を後から追跡できます。
        </p>
        <p className="font-semibold text-foreground">(3) サーバー側で bundle 署名と金額を厳格に検証する</p>
        <p>
          Paylancer の API は bundle 署名（payer/token/recipient/paymentId/deadline をまとめた EIP-712 メッセージ）を受信した時点で検証します。
          署名者が支払い主と一致するか、締め切りを超えていないか、mainAmount と feeAmount の合計が Authorization の value と一致するか、といったチェックを通過したものだけがジョブとして保存されます。
          この段階で `paymentId` と `nonce` の重複、支払いレンジの逸脱、許可されていないトークンなどが弾かれるため、ファシリテーターが扱うデータはすでに「支払い可能なもの」に絞られています。
        </p>
        <p className="font-semibold text-foreground">(4) ファシリテーターがジョブを取得して実行を予約する</p>
        <p>
          ファシリテーター（実行者）は `/api/jobs` から pending ジョブを取得し、送金内容と期日を確認します。
          内容に問題がなければ、`processing` → `executed` などのステータス遷移を行いつつ、ウォレットで支払いトランザクションを実行します。
          実行後はトランザクションハッシュや失敗理由を Paylancer に報告することで、運営やユーザーが状況を追跡できます。ジョブ取得・進捗更新の記録も `job_events` に蓄積され、運用監査の土台となります。
        </p>
        <p className="font-semibold text-foreground">(5) Executor が支払いと報酬を配分する</p>
        <p>
          オンチェーンでは `ERC3009Executor` コントラクトが bundle 署名と `paymentId` の再利用をチェックし、`transferWithAuthorization` を使って支払い主から main+fee を引き出します。
          受け取った資金は受取人へ送金しつつ、fee をオペレーターとファシリテーターで自動分配します。これにより「支払いが実行されると同時に、関係者が正しく報酬を受け取る」ことがプロトコルレベルで保証されます。
        </p>
        <p className="font-semibold text-foreground">(6) ジョブのライフサイクルとクリーンアップ</p>
        <p>
          ジョブが保存されたあとは、ファシリテーターが `/api/jobs/[id]` の PATCH で `pending → processing → executed/failed` と状態を進めます。
          期限切れのジョブや予約は管理 API（`/api/admin/jobs/cleanup`）によって自動的に `expired` へ移行し、24 時間を過ぎた予約は削除されます。
          これにより、古い支払い指示がたまり続けることなく、常に最新のジョブだけがファシリテーターに提示されます。
          なお `paymentId` は x402（HTTP 402 応答）との連携にも利用でき、オンチェーン実行と外部システムの「支払い済み」記録を紐付けるキーとして機能します。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">3. 既存のファシリテーター運用で起こりがちな問題</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong className="text-foreground">重複実行のリスク:</strong> 同じ支払い依頼が複数回登録されても気付けず、オンチェーンで失敗するまで判明しない。
          </li>
          <li>
            <strong className="text-foreground">署名の整合性チェックが後回し:</strong> 実行時に署名が不正と分かり、ガス代や時間が無駄になる。
          </li>
          <li>
            <strong className="text-foreground">状況の見える化不足:</strong> 誰がいつ取得して、どの段階で止まったのかがログに残らず、利用者からの問い合わせに答えづらい。
          </li>
          <li>
            <strong className="text-foreground">期限切れジョブの滞留:</strong> 古い依頼が堆積していくと、ファシリテーターは必要なジョブを探すのに時間がかかる。
          </li>
        </ul>
        <p>
          Paylancer は予約レイヤーとステータス運用、イベントログを組み合わせることで、これらの課題を早期に顕在化させ、対処可能にします。
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">4. Paylancer を導入するメリット</h2>
        <div className="space-y-3">
          <p>
            <strong className="text-foreground">利用者のメリット</strong>
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>一度支払い依頼を送るだけで、複数のファシリテーターに拾ってもらえるため、実行までの待ち時間が短縮される。</li>
            <li>支払いの有効期限や状況が明確で、不安なく「あとで送る」を選択できる。</li>
          </ul>
        </div>
        <div className="space-y-3">
          <p>
            <strong className="text-foreground">ファシリテーターのメリット</strong>
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>事前検証済みのジョブを取得でき、ガス代の無駄が減る。</li>
            <li>`bundleSignature` と `paymentId` の二重確認により、報酬が確実に自動分配される。手動精算や未払いリスクを気にせず運用できる。</li>
            <li>ログと予約テーブルのおかげで、実行できない理由が明確になり、運用改善に繋がる。</li>
            <li>失敗・成功イベントがすべて保存されるため、チーム内での責任所在や監査が容易。</li>
          </ul>
        </div>
        <div className="space-y-3">
          <p>
            <strong className="text-foreground">運営者のメリット</strong>
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>API とダッシュボードでサービス全体の健全性を把握でき、障害兆候を早期に発見できる。</li>
            <li>予約テーブルによる重複防止と自動クリーンアップにより、サーバーコストや DB 負荷を抑えられる。</li>
            <li>監査ログが残るため、ステークホルダーへの説明責任やコンプライアンス面の安心感を提供できる。</li>
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-semibold text-foreground">5. まとめ</h2>
        <p>
          Paylancer は「署名済みの支払い指示を、透明性と再現性を持って運用する」ためのプラットフォームです。
          技術的な詳細は脇に置き、実際に得られる価値――<strong>重複防止・期限管理・ログ可視化・迅速な実行</strong>――に焦点を当てています。
        </p>
        <p>
          既存のファシリテーター運用で抱えていた悩みを整理し、Paylancer がどのように解決するかを本ホワイトペーパーで理解いただけたなら、
          次はぜひ実際にジョブを登録して体験してみてください。
        </p>
      </section>
    </article>
  );
}
