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
  BundleMessage,
  buildAuthorizationTypedData,
  buildBundleTypedData,
  generateNonce,
  normalizePaymentId,
  parseTokenAmount,
  splitSignature
} from "@/lib/eip3009";
import type { SignatureParts } from "@/lib/eip3009";
import type { AuthorizationRecord, BundleRecord } from "@/lib/jobs/types";
import type { SupportedTokenConfig } from "@/lib/tokens";
import {
  DEFAULT_FEE_AMOUNT,
  getTokensForChain,
  SUPPORTED_CHAINS
} from "@/lib/tokens";
import { EXECUTOR_CONTRACT_ADDRESS } from "@/lib/config";
import { cn } from "@/lib/utils";

function serializeAuthorization(
  auth: AuthorizationMessage,
  signature: SignatureParts
): AuthorizationRecord {
  return {
    from: auth.from,
    to: auth.to,
    value: auth.value.toString(),
    validAfter: auth.validAfter.toString(),
    validBefore: auth.validBefore.toString(),
    nonce: auth.nonce,
    signature: signature.signature,
    v: signature.v,
    r: signature.r,
    s: signature.s
  };
}

function serializeBundle(bundle: BundleMessage): BundleRecord {
  return {
    payer: bundle.payer,
    token: bundle.token,
    recipient: bundle.recipient,
    mainAmount: bundle.mainAmount.toString(),
    feeAmount: bundle.feeAmount.toString(),
    paymentId: bundle.paymentId,
    deadline: bundle.deadline.toString()
  };
}

type FormState = {
  recipient: string;
  amount: string;
  feeAmount: string;
  validDate: string;
  validTime: string;
  tokenIndex: number;
};

type JobPreview = {
  id?: string;
  chainId: number;
  token: `0x${string}`;
  recipient: `0x${string}`;
  authorization: AuthorizationRecord;
  bundle: BundleRecord;
  bundleSignature: string;
  mainAmount: string;
  feeAmount: string;
};

const DEFAULT_FORM: FormState = {
  recipient: "",
  amount: "",
  feeAmount: "",
  validDate: "",
  validTime: "",
  tokenIndex: -1
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

  const tokens = useMemo(() => {
    const list = getTokensForChain(chainId);
    if (list.length > 0 && list[0].symbol !== "JPYC") {
      const sorted = [...list].sort((a, b) => {
        if (a.symbol === "JPYC") return -1;
        if (b.symbol === "JPYC") return 1;
        return 0;
      });
      return sorted;
    }
    return list;
  }, [chainId]);
  const [form, setForm] = useState<FormState>(() => DEFAULT_FORM);
  const lastTokenSymbolRef = useRef<SupportedTokenConfig["symbol"] | null>(
    null
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (tokens.length === 0) return;

    const defaultIndex = tokens.findIndex((token) => token.symbol === "JPYC");
    const fallbackIndex = defaultIndex >= 0 ? defaultIndex : 0;

    if (form.tokenIndex === -1 || form.tokenIndex >= tokens.length) {
      setForm((prev) => ({
        ...prev,
        tokenIndex: fallbackIndex
      }));
      return;
    }

    const current = tokens[form.tokenIndex];
    if (!current) {
      setForm((prev) => ({
        ...prev,
        tokenIndex: fallbackIndex
      }));
    }
  }, [form.tokenIndex, tokens]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobPreview, setJobPreview] = useState<JobPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedToken =
    form.tokenIndex >= 0 && form.tokenIndex < tokens.length
      ? tokens[form.tokenIndex]
      : tokens[0];

  const currentChainLabel = useMemo(() => {
    if (!chainId) return null;
    const chain = SUPPORTED_CHAINS.find((item) => item.id === chainId);
    return chain ? `${chain.name} (#${chainId})` : `Chain #${chainId}`;
  }, [chainId]);

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
    setSuccessMessage(null);

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

      if (!chainId) {
        throw new Error("チェーン情報を取得できませんでした。ウォレット接続を確認してください。");
      }

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

      const executorAddress = EXECUTOR_CONTRACT_ADDRESS as `0x${string}`;

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
      const totalValue = mainValue + feeValue;

      const authorizationMessage: AuthorizationMessage = {
        from: address,
        to: executorAddress,
        value: totalValue,
        validAfter: 0n,
        validBefore,
        nonce: generateNonce()
      };

      const authorizationTypedData = buildAuthorizationTypedData(
        selectedToken,
        chainId,
        authorizationMessage
      );

      const authorizationSignature = await signTypedDataAsync(
        authorizationTypedData
      );
      const authorizationSignatureParts = splitSignature(authorizationSignature);

      const paymentId = normalizePaymentId(generateNonce());
      const bundleMessage: BundleMessage = {
        payer: address,
        token: selectedToken.address,
        recipient,
        mainAmount: mainValue,
        feeAmount: feeValue,
        paymentId,
        deadline: validBefore
      };
      const bundleTypedData = buildBundleTypedData(
        executorAddress,
        chainId,
        bundleMessage
      );
      const bundleSignature = await signTypedDataAsync(bundleTypedData);

      const job: JobPreview = {
        chainId,
        token: selectedToken.address,
        recipient,
        authorization: serializeAuthorization(
          authorizationMessage,
          authorizationSignatureParts
        ),
        bundle: serializeBundle(bundleMessage),
        bundleSignature,
        mainAmount: mainValue.toString(),
        feeAmount: feeValue.toString()
      };

      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chainId,
          token: selectedToken.address,
          status: "pending",
          authorization: job.authorization,
          recipient,
          bundle: job.bundle,
          bundleSignature,
          bundleDeadline: bundleMessage.deadline.toString(),
          mainAmount: job.mainAmount,
          feeAmount: job.feeAmount,
          x402PaymentId: job.bundle.paymentId
        })
      });

      if (!response.ok) {
        const { error: apiError } = await response
          .json()
          .catch(() => ({ error: "ジョブの保存に失敗しました。" }));
        throw new Error(apiError ?? "ジョブの保存に失敗しました。");
      }

      const payload = await response.json();
      const savedJob = payload.job ?? null;

      if (savedJob) {
        setJobPreview({
          id: savedJob.id,
          chainId: Number(savedJob.chain_id ?? chainId),
          token: (savedJob.token as `0x${string}`) ?? job.token,
          recipient:
            (savedJob.recipient as `0x${string}` | undefined) ?? job.recipient,
          authorization:
            (savedJob.authorization_payload as AuthorizationRecord) ??
            job.authorization,
          bundle: (savedJob.bundle as BundleRecord | null) ?? job.bundle,
          bundleSignature: savedJob.bundle_signature ?? job.bundleSignature,
          mainAmount: savedJob.main_amount ?? job.mainAmount,
          feeAmount: savedJob.fee_amount ?? job.feeAmount
        });
      } else {
        setJobPreview(job);
      }

      setSuccessMessage("送金チケットを保存しました。");
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

  const currentChain = useMemo(() => {
    if (!chainId) return null;
    return SUPPORTED_CHAINS.find((chain) => chain.id === chainId);
  }, [chainId]);

  const chainDisplay = useMemo(() => {
    if (!mounted || !currentChain || !chainId) {
      return "チェーン情報取得中";
    }
    return `${currentChain.name} (#${chainId})`;
  }, [mounted, currentChain, chainId]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <h2 className="text-2xl  mt-5 font-semibold text-foreground">
            送金チケットの作成
          </h2>
          <p className="text-sm text-muted-foreground">
            送金条件と手数料を入力し、ウォレットで transferWithAuthorization（合計額）と bundle の2署名を順番に行います。
          </p>
        </div>
        <aside className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground shadow-sm backdrop-blur">
          <div className="uppercase tracking-wide text-xs text-muted-foreground/80">
            接続チェーン
          </div>
          <div className="font-medium text-foreground">{chainDisplay}</div>
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
          <p className="text-xs text-muted-foreground min-h-[44px]">
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
          <p className="text-xs text-muted-foreground min-h-[44px]">
            transferWithAuthorization の宛先は常に {EXECUTOR_CONTRACT_ADDRESS}（合計額）です。実行時にコントラクトが受取人と fee を振り分けます。
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
      {successMessage ? (
        <div className="rounded-md border border-border/40 bg-muted/10 px-4 py-3 text-sm text-foreground">
          {successMessage}
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
                recipient: jobPreview.recipient,
                authorization: {
                  ...jobPreview.authorization,
                  humanReadable: formatUnits(
                    BigInt(jobPreview.authorization.value),
                    selectedToken?.decimals ?? 6
                  )
                },
                bundle: jobPreview.bundle,
                bundleSignature: jobPreview.bundleSignature,
                mainAmount: formatUnits(
                  BigInt(jobPreview.mainAmount),
                  selectedToken?.decimals ?? 6
                ),
                feeAmount: formatUnits(
                  BigInt(jobPreview.feeAmount),
                  selectedToken?.decimals ?? 6
                )
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
