"use client";

import { useMemo } from "react";
import { format } from "date-fns";

import { EXECUTOR_CONTRACT_ADDRESS } from "@/lib/config";
import type { CreateJobFormController } from "@/lib/jobs/hooks/useCreateJobFormState";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function CreateJobFormDefaultView({ controller }: { controller: CreateJobFormController }) {
  const {
    disabled,
    form,
    tokens,
    selectedToken,
    isSubmitting,
    jobPreview,
    error,
    successMessage,
    chainDisplay,
    changeField,
    handleFeeAmountChange,
    handleDateSelect,
    handleTimeChange,
    handleSubmit
  } = controller;

  const formattedDeadline = useMemo(() => {
    if (!form.validDate) return "日付を選択";
    return format(new Date(`${form.validDate}T00:00`), "yyyy/MM/dd");
  }, [form.validDate]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <h2 className="mt-5 text-2xl font-semibold text-foreground">送金チケットの作成</h2>
          <p className="text-sm text-muted-foreground">
            送金条件と手数料を入力し、ウォレットで transferWithAuthorization（合計額）と bundle の2署名を順番に行います。
          </p>
        </div>
        <aside className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground shadow-sm backdrop-blur">
          <div className="uppercase tracking-wide text-xs text-muted-foreground/80">接続チェーン</div>
          <div className="font-medium text-foreground">{chainDisplay}</div>
        </aside>
      </header>

      {tokens.length === 0 ? (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
          このチェーンでは対応トークンが定義されていません。接続チェーンを切り替えてください。
        </div>
      ) : null}

      <form className="grid grid-cols-1 gap-6 md:grid-cols-2" onSubmit={handleSubmit}>
        <fieldset disabled={disabled} className="contents disabled:cursor-not-allowed disabled:opacity-60">
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="token">トークン</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <select
                id="token"
                value={form.tokenIndex}
                onChange={changeField("tokenIndex")}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:w-80"
              >
                {tokens.map((token, index) => (
                  <option key={token.address} value={index}>
                    {token.symbol}・{token.name}
                  </option>
                ))}
              </select>
              {selectedToken ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground sm:flex-1 sm:justify-end">
                  <span className="hidden sm:inline">コントラクト:</span>
                  <code className="truncate rounded bg-muted px-2 py-1 text-muted-foreground">
                    {selectedToken.address}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => navigator.clipboard.writeText(selectedToken.address)}
                  >
                    コピー
                  </Button>
                </div>
              ) : null}
            </div>
            {selectedToken ? (
              <p className="text-xs text-muted-foreground sm:hidden">コントラクト: {selectedToken.address}</p>
            ) : null}
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="recipient">受取アドレス</Label>
            <Input
              id="recipient"
              type="text"
              placeholder="0x..."
              value={form.recipient}
              onChange={changeField("recipient")}
              required
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
            />
            <p className="text-xs text-muted-foreground">
              transferWithAuthorization の宛先は常に {EXECUTOR_CONTRACT_ADDRESS}（合計額）です。実行時にコントラクトが受取人と fee を振り分けます。
            </p>
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label>有効期限</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex h-10 w-full items-center justify-start gap-2 self-start rounded-md border border-input bg-background px-3 text-left text-sm text-foreground shadow-sm transition focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:w-48"
                  >
                    {formattedDeadline}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.validDate ? new Date(`${form.validDate}T00:00`) : undefined}
                    onSelect={handleDateSelect}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Input
                type="time"
                step={60}
                value={form.validTime}
                onChange={handleTimeChange}
                required
                className="w-full sm:w-32"
              />
            </div>
            <p className="text-xs text-muted-foreground">現在時刻より後を指定してください。</p>
          </div>

          <div className="md:col-span-2">
            <Button type="submit" className="w-full md:w-auto" disabled={isSubmitting || tokens.length === 0}>
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
        <section className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-5 text-sm shadow-sm backdrop-blur">
          <header className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">生成されたジョブ</h3>
            <p className="text-xs text-muted-foreground">
              `job_id` と `paymentId` を控えておくと、ステータス確認 API から進行状況を追跡できます。
            </p>
          </header>
          <dl className="grid grid-cols-1 gap-y-2 text-xs text-muted-foreground sm:grid-cols-2">
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
