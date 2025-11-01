"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { format } from "date-fns";
import { useAccount, useChainId, useSignTypedData } from "wagmi";

import { EXECUTOR_CONTRACT_ADDRESS } from "@/lib/config";
import type { AuthorizationRecord, BundleRecord } from "@/lib/jobs/types";
import type { SupportedTokenConfig } from "@/lib/tokens";
import {
  DEFAULT_FEE_AMOUNT,
  SUPPORTED_CHAINS,
  getTokensForChain
} from "@/lib/tokens";
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

export type FormState = {
  recipient: string;
  amount: string;
  feeAmount: string;
  validDate: string;
  validTime: string;
  tokenIndex: number;
};

const DEFAULT_FORM: FormState = {
  recipient: "",
  amount: "",
  feeAmount: "",
  validDate: "",
  validTime: "",
  tokenIndex: -1
};

export type CreateJobFormPrefill = {
  tokenAddress?: `0x${string}`;
  recipient?: string;
  amount?: string;
  feeAmount?: string;
};

export type CreateJobFormLocks = {
  token?: boolean;
  recipient?: boolean;
  amount?: boolean;
  feeAmount?: boolean;
};

export type JobPreview = {
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

function formatNowPlusMinutes(minutes: number) {
  const date = new Date(Date.now() + minutes * 60 * 1000);
  date.setSeconds(0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export type UseCreateJobFormStateArgs = {
  disabled?: boolean;
  prefill?: CreateJobFormPrefill;
  lock?: CreateJobFormLocks;
};

export type CreateJobFormController = ReturnType<typeof useCreateJobFormState>;

export function useCreateJobFormState({
  disabled = false,
  prefill,
  lock
}: UseCreateJobFormStateArgs = {}) {
  const chainId = useChainId();
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const lockedFields = {
    token: Boolean(lock?.token),
    recipient: Boolean(lock?.recipient),
    amount: Boolean(lock?.amount),
    feeAmount: Boolean(lock?.feeAmount)
  };

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

  const [form, setForm] = useState<FormState>(() => ({
    ...DEFAULT_FORM,
    recipient: prefill?.recipient ?? DEFAULT_FORM.recipient,
    amount: prefill?.amount ?? DEFAULT_FORM.amount,
    feeAmount: prefill?.feeAmount ?? DEFAULT_FORM.feeAmount
  }));
  const lastTokenSymbolRef = useRef<SupportedTokenConfig["symbol"] | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobPreview, setJobPreview] = useState<JobPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const targetTokenAddressRef = useRef<string | null>(prefill?.tokenAddress?.toLowerCase() ?? null);
  const tokenAddressNotFoundRef = useRef(false);

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
    setMounted(true);
  }, []);

  useEffect(() => {
    if (prefill?.tokenAddress) {
      targetTokenAddressRef.current = prefill.tokenAddress.toLowerCase();
    }
  }, [prefill?.tokenAddress]);

  useEffect(() => {
    if (tokens.length === 0) return;

    const defaultIndex = tokens.findIndex((token) => token.symbol === "JPYC");
    const fallbackIndex = defaultIndex >= 0 ? defaultIndex : 0;

    let nextIndex = form.tokenIndex;

    if (targetTokenAddressRef.current) {
      const normalized = targetTokenAddressRef.current;
      const matchedIndex = tokens.findIndex((token) => token.address.toLowerCase() === normalized);

      if (matchedIndex >= 0) {
        nextIndex = matchedIndex;
        targetTokenAddressRef.current = null;
        tokenAddressNotFoundRef.current = false;
        setError((currentError) => {
          if (currentError && currentError.startsWith("指定されたトークン")) {
            return null;
          }
          return currentError;
        });
      } else if (!tokenAddressNotFoundRef.current) {
        tokenAddressNotFoundRef.current = true;
        setError(
          "指定されたトークンはこのチェーンで利用できません。ウォレットの接続チェーンと指定アドレスをご確認ください。"
        );
      }
    }

    if (nextIndex === -1 || nextIndex >= tokens.length || nextIndex < 0) {
      nextIndex = fallbackIndex;
    }

    if (form.tokenIndex !== nextIndex) {
      setForm((prev) => ({
        ...prev,
        tokenIndex: nextIndex
      }));
    }
  }, [form.tokenIndex, tokens]);

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
    if (lockedFields.feeAmount) return;
    if (prefill?.feeAmount) return;
    if (lastTokenSymbolRef.current === selectedToken.symbol) return;

    setForm((prev) => ({
      ...prev,
      feeAmount: DEFAULT_FEE_AMOUNT[selectedToken.symbol]
    }));
    lastTokenSymbolRef.current = selectedToken.symbol;
  }, [selectedToken, lockedFields.feeAmount, prefill?.feeAmount]);

  useEffect(() => {
    const nextRecipient = prefill?.recipient;
    if (!nextRecipient) return;
    if (!lockedFields.recipient) return;
    setForm((prev) => {
      if (prev.recipient === nextRecipient) return prev;
      return { ...prev, recipient: nextRecipient };
    });
  }, [prefill?.recipient, lockedFields.recipient]);

  useEffect(() => {
    const nextAmount = prefill?.amount;
    if (!nextAmount) return;
    if (!lockedFields.amount) return;
    setForm((prev) => {
      if (prev.amount === nextAmount) return prev;
      return { ...prev, amount: nextAmount };
    });
  }, [prefill?.amount, lockedFields.amount]);

  useEffect(() => {
    const nextFee = prefill?.feeAmount;
    if (!nextFee) return;
    if (!lockedFields.feeAmount) return;
    setForm((prev) => {
      if (prev.feeAmount === nextFee) return prev;
      return { ...prev, feeAmount: nextFee };
    });
  }, [prefill?.feeAmount, lockedFields.feeAmount]);

  const changeField =
    <K extends keyof FormState>(key: K) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      if (
        (key === "tokenIndex" && lockedFields.token) ||
        (key === "recipient" && lockedFields.recipient) ||
        (key === "amount" && lockedFields.amount) ||
        (key === "feeAmount" && lockedFields.feeAmount)
      ) {
        return;
      }
      setForm((prev) => ({ ...prev, [key]: event.target.value }));
    };

  const handleFeeAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (lockedFields.feeAmount) return;
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
    setForm((prev) => ({ ...prev, validTime: value }));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (disabled) return;

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

      const validBefore = BigInt(Math.floor(validBeforeDate.getTime() / 1000));
      const now = BigInt(Math.floor(Date.now() / 1000));
      if (validBefore <= now) {
        throw new Error("有効期限は現在時刻より後に設定してください。");
      }

      const mainValue = parseTokenAmount(form.amount, selectedToken.decimals);
      const feeValue = parseTokenAmount(form.feeAmount, selectedToken.decimals);
      const totalValue = mainValue + feeValue;

      const authorizationMessage: AuthorizationMessage = {
        from: address,
        to: EXECUTOR_CONTRACT_ADDRESS as `0x${string}`,
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

      const authorizationSignature = await signTypedDataAsync(authorizationTypedData);
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
        EXECUTOR_CONTRACT_ADDRESS as `0x${string}`,
        chainId,
        bundleMessage
      );
      const bundleSignature = await signTypedDataAsync(bundleTypedData);

      const job: JobPreview = {
        chainId,
        token: selectedToken.address,
        recipient,
        authorization: serializeAuthorization(authorizationMessage, authorizationSignatureParts),
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
          recipient: (savedJob.recipient as `0x${string}` | undefined) ?? job.recipient,
          authorization: (savedJob.authorization_payload as AuthorizationRecord) ?? job.authorization,
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
        submitError instanceof Error ? submitError.message : "送金チケット作成に失敗しました。"
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

  return {
    address,
    chainId,
    disabled,
    form,
    selectedToken,
    tokens,
    isSubmitting,
    jobPreview,
    error,
    successMessage,
    chainDisplay,
    lockedFields,
    changeField,
    handleFeeAmountChange,
    handleDateSelect,
    handleTimeChange,
    handleSubmit,
    setSuccessMessage,
    setJobPreview,
    setError
  };
}
