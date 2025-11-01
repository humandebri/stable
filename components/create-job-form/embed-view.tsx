"use client";

import { useEffect, useRef } from "react";

import { EXECUTOR_CONTRACT_ADDRESS } from "@/lib/config";
import type { CreateJobFormController } from "@/lib/jobs/hooks/useCreateJobFormState";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateJobFormEmbedView({ controller }: { controller: CreateJobFormController }) {
  const {
    disabled,
    form,
    tokens,
    selectedToken,
    isSubmitting,
    jobPreview,
    error,
    successMessage,
    lockedFields,
    changeField,
    handleFeeAmountChange,
    handleSubmit
  } = controller;

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const parentWindow = window.parent;
    if (!parentWindow || parentWindow === window) return;
    const element = containerRef.current;
    if (!element) return;

    const postHeight = () => {
      parentWindow.postMessage(
        {
          type: "paylancer:height",
          height: element.offsetHeight
        },
        "*"
      );
    };

    postHeight();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(postHeight);
      observer.observe(element);
      return () => observer.disconnect();
    }

    const interval = window.setInterval(postHeight, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div ref={containerRef} className="space-y-5 p-2 bg-white">
      <header className="space-y-2 text-center">
        <h2 className="text-xl font-semibold text-foreground">送金チケットを作成</h2>
        <p className="text-xs text-muted-foreground">
          transferWithAuthorization（合計額）と bundle の2署名でウォレットからジョブを保存します。
        </p>
      </header>

      {tokens.length === 0 ? (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
          このチェーンでは対応トークンが定義されていません。接続チェーンを切り替えてください。
        </div>
      ) : null}

      <form className="mx-auto grid w-full max-w-md grid-cols-1 gap-4" onSubmit={handleSubmit}>
        <fieldset disabled={disabled} className="contents disabled:cursor-not-allowed disabled:opacity-60">
          <div className="grid gap-2">
            <Label htmlFor="token">トークン</Label>
            <select
              id="token"
              value={form.tokenIndex}
              onChange={changeField("tokenIndex")}
              className={cn(
                "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                lockedFields.token && "cursor-not-allowed border-border/70 bg-muted text-muted-foreground"
              )}
              disabled={lockedFields.token}
              aria-disabled={lockedFields.token}
            >
              {tokens.map((token, index) => (
                <option key={token.address} value={index}>
                  {token.symbol}・{token.name}
                </option>
              ))}
            </select>
            {selectedToken ? (
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span>
                  コントラクト: <code className="break-all rounded bg-muted px-2 py-1">{selectedToken.address}</code>
                </span>
              </div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="recipient">受取アドレス</Label>
            <Input
              id="recipient"
              type="text"
              placeholder="0x..."
              value={form.recipient}
              onChange={changeField("recipient")}
              required
              readOnly={lockedFields.recipient}
              aria-readonly={lockedFields.recipient}
              className={cn(
                "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                lockedFields.recipient && "cursor-not-allowed border-border/70 bg-muted text-muted-foreground"
              )}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="amount">送金金額</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="any"
              placeholder="0.0"
              value={form.amount}
              onChange={changeField("amount")}
              required
              readOnly={lockedFields.amount}
              aria-readonly={lockedFields.amount}
              className={cn(
                "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                lockedFields.amount && "cursor-not-allowed border-border/70 bg-muted text-muted-foreground"
              )}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="feeAmount">ファシリテータ手数料</Label>
            <Input
              id="feeAmount"
              type="number"
              min="0"
              step="any"
              placeholder="0.5"
              value={form.feeAmount}
              onChange={handleFeeAmountChange}
              required
              readOnly={lockedFields.feeAmount}
              aria-readonly={lockedFields.feeAmount}
              className={cn(
                "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                lockedFields.feeAmount && "cursor-not-allowed border-border/70 bg-muted text-muted-foreground"
              )}
            />
            <p className="text-xs text-muted-foreground leading-relaxed">
              transferWithAuthorization の宛先は常に {EXECUTOR_CONTRACT_ADDRESS} です。
              実行時にコントラクトが受取人と fee を振り分けます。
            </p>
          </div>

          <div>
            <Button type="submit" className="w-full" disabled={isSubmitting || tokens.length === 0}>
              {isSubmitting ? "署名中..." : "署名してチケット生成"}
            </Button>
          </div>
        </fieldset>
      </form>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-md border border-border/40 bg-muted/10 px-4 py-3 text-sm text-foreground">
          {successMessage}
        </div>
      ) : null}

      {jobPreview ? (
        <section className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-5 text-sm shadow-sm">
          <header className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">生成されたジョブ</h3>
            <p className="text-xs text-muted-foreground">`job_id` と `paymentId` を控えるとステータス確認 API で追跡できます。</p>
          </header>
          <dl className="flex flex-col gap-2 text-xs text-muted-foreground">
            <div>
              <dt className="font-semibold text-foreground">ジョブID</dt>
              <dd className="break-all text-muted-foreground">{jobPreview.id ?? "保存中"}</dd>
            </div>
            <div>
              <dt className="font-semibold text-foreground">PaymentId</dt>
              <dd className="break-all text-muted-foreground">{jobPreview.bundle.paymentId}</dd>
            </div>
          </dl>
        </section>
      ) : null}
    </div>
  );
}
