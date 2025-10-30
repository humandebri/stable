"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount, useChainId, useSignTypedData } from "wagmi";
import { formatUnits } from "viem";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AuthorizationMessage,
  buildAuthorizationTypedData,
  generateNonce,
  parseTokenAmount,
  splitSignature
} from "@/lib/eip3009";
import type { SupportedTokenConfig } from "@/lib/tokens";
import {
  DEFAULT_FEE_AMOUNT,
  getTokensForChain,
  SUPPORTED_CHAINS
} from "@/lib/tokens";
import { cn } from "@/lib/utils";

type FormState = {
  recipient: string;
  amount: string;
  feeAmount: string;
  validDate: string;
  validTime: string;
  tokenIndex: number;
};

type JobPreview = {
  chainId: number;
  token: `0x${string}`;
  main: AuthorizationMessage & {
    signature: `0x${string}`;
    v: number;
    r: `0x${string}`;
    s: `0x${string}`;
  };
  fee: AuthorizationMessage & {
    signature: `0x${string}`;
    v: number;
    r: `0x${string}`;
    s: `0x${string}`;
  };
};

const DEFAULT_FORM: FormState = {
  recipient: "",
  amount: "",
  feeAmount: "",
  validDate: "",
  validTime: "",
  tokenIndex: 0
};

function formatNowPlusMinutes(minutes: number) {
  const date = new Date(Date.now() + minutes * 60 * 1000);
  date.setSeconds(0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

type CreateJobFormProps = {
  disabled?: boolean;
};

export function CreateJobForm({ disabled = false }: CreateJobFormProps) {
  const chainId = useChainId();
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const tokens = useMemo(() => getTokensForChain(chainId), [chainId]);
  const [form, setForm] = useState<FormState>(() => DEFAULT_FORM);
  const lastTokenSymbolRef = useRef<SupportedTokenConfig["symbol"] | null>(
    null
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobPreview, setJobPreview] = useState<JobPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedToken = tokens[form.tokenIndex];

  useEffect(() => {
    const hasInitialDate = form.validDate && form.validTime;
    if (hasInitialDate) return;

    const defaultDateTime = formatNowPlusMinutes(5);
    const [datePart = "", timePart = ""] = defaultDateTime.split("T");
    setForm((prev) => ({
      ...prev,
      validDate: datePart,
      validTime: timePart
    }));
  }, [form.validDate, form.validTime]);

  useEffect(() => {
    if (!selectedToken) return;
    if (lastTokenSymbolRef.current === selectedToken.symbol) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      feeAmount: DEFAULT_FEE_AMOUNT[selectedToken.symbol]
    }));
    lastTokenSymbolRef.current = selectedToken.symbol;
  }, [selectedToken]);

  const changeField =
    <K extends keyof FormState>(key: K) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
    };

  const handleFeeAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setForm((prev) => ({ ...prev, feeAmount: value }));
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setForm((prev) => ({
      ...prev,
      validDate: format(date, "yyyy-MM-dd")
    }));
  };

  const handleTimeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setForm((prev) => ({
      ...prev,
      validTime: value
    }));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

     if (disabled) {
       return;
     }

    if (!address) {
      setError("ウォレットが未接続です。");
      return;
    }

    if (!selectedToken) {
      setError("このチェーンでは対応トークンがありません。");
      return;
    }

    try {
      setIsSubmitting(true);

      const recipient = form.recipient.trim() as `0x${string}`;
      if (!recipient.startsWith("0x") || recipient.length !== 42) {
        throw new Error("受取人アドレスを正しく入力してください。");
      }

      if (!form.amount || Number.parseFloat(form.amount) <= 0) {
        throw new Error("送金金額を入力してください。");
      }

      if (!form.feeAmount || Number.parseFloat(form.feeAmount) < 0) {
        throw new Error("手数料金額を入力してください。");
      }

      const feeRecipient = address;

      if (!form.validDate) {
        throw new Error("有効期限の日付を選択してください。");
      }

      if (!form.validTime) {
        throw new Error("有効期限の時間を入力してください。");
      }

      const combinedDateTime = `${form.validDate}T${form.validTime}`;
      const validBeforeDate = new Date(combinedDateTime);
      if (Number.isNaN(validBeforeDate.getTime())) {
        throw new Error("有効期限を正しく入力してください。");
      }

      const validBefore = BigInt(
        Math.floor(validBeforeDate.getTime() / 1000)
      );
      const now = BigInt(Math.floor(Date.now() / 1000));
      if (validBefore <= now) {
        throw new Error("有効期限は現在時刻より後に設定してください。");
      }

      const mainValue = parseTokenAmount(form.amount, selectedToken.decimals);
      const feeValue = parseTokenAmount(form.feeAmount, selectedToken.decimals);

      const mainAuth: AuthorizationMessage = {
        from: address,
        to: recipient,
        value: mainValue,
        validAfter: 0n,
        validBefore,
        nonce: generateNonce()
      };

      const feeAuth: AuthorizationMessage = {
        from: address,
        to: feeRecipient,
        value: feeValue,
        validAfter: 0n,
        validBefore,
        nonce: generateNonce()
      };

      const domainMain = buildAuthorizationTypedData(
        selectedToken,
        chainId,
        mainAuth
      );
      const domainFee = buildAuthorizationTypedData(
        selectedToken,
        chainId,
        feeAuth
      );

      const mainSignature = await signTypedDataAsync(domainMain);
      const feeSignature = await signTypedDataAsync({
        ...domainFee,
        message: feeAuth
      });

      const job: JobPreview = {
        chainId,
        token: selectedToken.address,
        main: {
          ...mainAuth,
          ...splitSignature(mainSignature)
        },
        fee: {
          ...feeAuth,
          ...splitSignature(feeSignature)
        }
      };

      setJobPreview(job);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "送金チケット作成に失敗しました。"
      );
      setJobPreview(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  const currentChain = SUPPORTED_CHAINS.find((chain) => chain.id === chainId);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <h2 className="text-2xl  mt-5 font-semibold text-foreground">
            送金チケットの作成
          </h2>
          <p className="text-sm text-muted-foreground">
            送金条件と手数料を入力し、ウォレットで2つの署名を行います。
          </p>
        </div>
        <aside className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground shadow-sm backdrop-blur">
          <div className="uppercase tracking-wide text-xs text-muted-foreground/80">
            接続チェーン
          </div>
          <div className="font-medium text-foreground">
            {currentChain ? `${currentChain.name} (#${chainId})` : `ID: ${chainId}`}
          </div>
        </aside>
      </header>

      {tokens.length === 0 ? (
        <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
          このチェーンでは対応トークンが定義されていません。接続チェーンを切り替えてください。
        </div>
      ) : null}

      <form className="grid grid-cols-1 gap-6 md:grid-cols-2" onSubmit={handleSubmit}>
        <fieldset
          disabled={disabled}
          className="contents disabled:cursor-not-allowed disabled:opacity-60"
        >
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
                  onClick={() =>
                    navigator.clipboard.writeText(selectedToken.address)
                  }
                >
                  コピー
                </Button>
              </div>
            ) : null}
          </div>
          {selectedToken ? (
            <p className="text-xs text-muted-foreground sm:hidden">
              コントラクト: {selectedToken.address}
            </p>
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
          <p className="text-xs text-muted-foreground">
            残高・精度を確認してください。小数点以下
            {selectedToken ? selectedToken.decimals : 0}桁。
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="feeAmount">ファシリテータ手数料</Label>
          <Input
            id="feeAmount"
            type="number"
            min="0"
            step="any"
            placeholder="0.0"
            value={form.feeAmount}
            onChange={handleFeeAmountChange}
            required
          />
          <p className="text-xs text-muted-foreground">
            残高・精度を確認してください。小数点以下
            {selectedToken ? selectedToken.decimals : 0}桁。
          </p>
        </div>

        <div className="grid gap-2 md:col-span-2">
          <Label>有効期限</Label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal sm:w-48",
                    !form.validDate && "text-muted-foreground"
                  )}
                >
                  {form.validDate
                    ? format(
                        new Date(`${form.validDate}T00:00`),
                        "yyyy/MM/dd"
                      )
                    : "日付を選択"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={
                    form.validDate
                      ? new Date(`${form.validDate}T00:00`)
                      : undefined
                  }
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
          <p className="text-xs text-muted-foreground">
            現在時刻より後を指定してください。
          </p>
        </div>

        <div className="md:col-span-2">
          <Button
            type="submit"
            className="w-full md:w-auto"
            disabled={isSubmitting || tokens.length === 0}
          >
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

      {jobPreview ? (
        <section className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-5 text-sm shadow-sm backdrop-blur">
          <header className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">
              生成されたジョブ
            </h3>
            <p className="text-muted-foreground">
              チェーンID <span className="font-medium">{jobPreview.chainId}</span>{" "}
              / トークン{" "}
              <span className="font-medium">
                {selectedToken?.symbol} ({selectedToken?.address})
              </span>
            </p>
          </header>
          <pre className="max-h-96 overflow-auto rounded-md border border-border/40 bg-background/80 p-4 text-xs leading-relaxed text-muted-foreground">
            {JSON.stringify(
              {
                chainId: jobPreview.chainId,
                token: jobPreview.token,
                main: {
                  from: jobPreview.main.from,
                  to: jobPreview.main.to,
                  value: jobPreview.main.value.toString(),
                  validAfter: jobPreview.main.validAfter.toString(),
                  validBefore: jobPreview.main.validBefore.toString(),
                  nonce: jobPreview.main.nonce,
                  signature: jobPreview.main.signature,
                  v: jobPreview.main.v,
                  r: jobPreview.main.r,
                  s: jobPreview.main.s,
                  humanReadable: formatUnits(
                    jobPreview.main.value,
                    selectedToken?.decimals ?? 6
                  )
                },
                fee: {
                  from: jobPreview.fee.from,
                  to: jobPreview.fee.to,
                  value: jobPreview.fee.value.toString(),
                  validAfter: jobPreview.fee.validAfter.toString(),
                  validBefore: jobPreview.fee.validBefore.toString(),
                  nonce: jobPreview.fee.nonce,
                  signature: jobPreview.fee.signature,
                  v: jobPreview.fee.v,
                  r: jobPreview.fee.r,
                  s: jobPreview.fee.s,
                  humanReadable: formatUnits(
                    jobPreview.fee.value,
                    selectedToken?.decimals ?? 6
                  )
                }
              },
              null,
              2
            )}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
