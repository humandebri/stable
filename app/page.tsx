import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

const FEATURES = [
  {
    title: "署名の省力化",
    description:
      "transferWithAuthorization と EIP-712 バンドルの 2 署名だけで送金チケットを作成できます。"
  },
  {
    title: "フェアな手数料分配",
    description:
      "fee は自動で運営 10%・ファシリテーター 90% に分配され、実行側のモチベーションを確保します。"
  },
  {
    title: "分散したファシリテーター",
    description:
      "送金エージェントが社会インフラになっても止まらないよう、複数のファシリテーターが独立して動ける設計です。単一のファシリテーターが止まってもサービス全体は継続します。"
  },
  {
    title: "効率的なライブラリ",
    description:
      "数行の React コードで iframe ウィジェットを埋め込めます。Docs の埋め込みガイドからコピー＆ペーストするだけです。"
  }
];

export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-16">
      <section className="space-y-6 text-center">
        <span className="rounded-full border border-border/60 bg-muted/40 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Paylancer
        </span>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          フロントとファシリテーターが協調する送金基盤
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">
          ユーザーはウォレットで 2 回署名し、ジョブとして保存。
          ファシリテーターは署名済みデータを検証してチェーンに流すだけ。
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/jobs">ユーザーダッシュボードへ</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href="/facilitator">ファシリテーターハブへ</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {FEATURES.map((feature) => (
          <Card key={feature.title} className="border-border/70 bg-card/80">
            <CardHeader>
              <CardTitle className="text-lg">{feature.title}</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                {feature.description}
              </CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>
    </main>
  );
}
