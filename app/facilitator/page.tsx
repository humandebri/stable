"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { formatUnits } from "viem";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { EXECUTOR_CONTRACT_ADDRESS } from "@/lib/config";
import { normalizeJobExecution } from "@/lib/jobs/executor";
import type { JobsResponse, JobRecord } from "@/lib/jobs/types";
import { SUPPORTED_CHAINS, getTokensForChain } from "@/lib/tokens";
import { useExecuteJob } from "@/lib/jobs/hooks/useExecuteJob";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

type JobListItemProps = {
  job: JobRecord;
  onExecuted?: () => void;
};

function formatChainName(chainId: number) {
  const chain = SUPPORTED_CHAINS.find((item) => item.id === chainId);
  return chain ? chain.name : `Chain #${chainId}`;
}

function JobExecuteButton({ job, onExecuted }: JobListItemProps) {
  const { address, chainId, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: job.chain_id });
  const { data: walletClient } = useWalletClient();

  const disabledReason = (() => {
    if (!isConnected) return "ウォレットを接続してください";
    if (!walletClient) return "ウォレットクライアントを取得できません";
    if (!address) return "ウォレットアカウントが確認できません";
    if (chainId && chainId !== job.chain_id) {
      return `ウォレットのチェーンを ${formatChainName(job.chain_id)} に合わせてください`;
    }
    return null;
  })();

  const executeJob = useExecuteJob({
    job,
    walletClient: walletClient!,
    publicClient: publicClient ?? undefined,
    executor: EXECUTOR_CONTRACT_ADDRESS as `0x${string}`
  });

  const handleExecute = async () => {
    if (disabledReason) return;
    await executeJob.execute();
    onExecuted?.();
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        onClick={handleExecute}
        disabled={Boolean(disabledReason) || executeJob.isLoading}
        className="text-xs"
      >
        {executeJob.isLoading ? "実行中..." : "実行する"}
      </Button>
      {disabledReason ? (
        <span className="text-xs text-muted-foreground">{disabledReason}</span>
      ) : null}
      {executeJob.error ? (
        <span className="text-xs text-destructive">
          {executeJob.error.message ?? "ジョブ実行に失敗しました"}
        </span>
      ) : null}
    </div>
  );
}

function JobListItem({ job, onExecuted }: JobListItemProps) {
  const tokens = getTokensForChain(job.chain_id);
  const token = tokens.find(
    (item) => item.address.toLowerCase() === job.token.toLowerCase()
  );

  const formatAmount = (value: string | bigint) => {
    try {
      const bigValue = typeof value === "bigint" ? value : BigInt(value);
      const formatted = formatUnits(bigValue, token?.decimals ?? 18);
      return `${formatted} ${token?.symbol ?? "TOKEN"}`;
    } catch (error) {
      console.warn("Failed to format token amount", error);
      return `${value.toString()} (raw)`;
    }
  };

  let mainAmount: bigint | null = null;
  let feeAmount: bigint | null = null;
  let recipient = job.recipient ?? job.bundle?.recipient ?? job.main?.to ?? ZERO_ADDRESS;
  let payer = job.authorization_payload?.from ?? job.main?.from ?? ZERO_ADDRESS;
  let paymentId = job.payment_id ?? job.x402_payment_id ?? job.bundle?.paymentId ?? null;
  let executionError: string | null = null;

  try {
    const normalized = normalizeJobExecution(job);
    mainAmount = normalized.mainAmount;
    feeAmount = normalized.feeAmount;
    recipient = normalized.recipient;
    payer = normalized.authorization.from;
    paymentId = normalized.paymentId;
  } catch (error) {
    executionError = error instanceof Error ? error.message : String(error);
  }

  const fallbackMain = mainAmount ?? BigInt(job.main_amount ?? job.bundle?.mainAmount ?? job.main?.value ?? "0");
  const fallbackFee = feeAmount ?? BigInt(job.fee_amount ?? job.bundle?.feeAmount ?? job.fee?.value ?? "0");

  let operatorShareLabel: string | null = null;
  let facilitatorShareLabel: string | null = null;

  try {
    const operatorShare = (fallbackFee * 1000n) / 10000n;
    const facilitatorShare = fallbackFee - operatorShare;
    operatorShareLabel = formatAmount(operatorShare);
    facilitatorShareLabel = formatAmount(facilitatorShare);
  } catch (error) {
    console.warn("Failed to derive fee split", error);
  }

  const expiresAt = job.expires_at ? new Date(job.expires_at) : null;
  const expiresLabel = expiresAt
    ? formatDistanceToNow(expiresAt, { addSuffix: true })
    : "期限情報なし";

  const bundleDeadlineAt = job.bundle_deadline_at
    ? new Date(job.bundle_deadline_at)
    : job.bundle_deadline
      ? new Date(Number(job.bundle_deadline) * 1000)
      : expiresAt;
  const bundleDeadlineLabel = bundleDeadlineAt
    ? formatDistanceToNow(bundleDeadlineAt, { addSuffix: true })
    : null;

  const takenLabel = job.taken_at
    ? formatDistanceToNow(new Date(job.taken_at), { addSuffix: true })
    : null;
  const executedLabel = job.executed_at
    ? formatDistanceToNow(new Date(job.executed_at), { addSuffix: true })
    : null;

  return (
    <li className="rounded-lg border border-border/60 bg-card/80 px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {formatChainName(job.chain_id)}
            </span>
            <span className="font-semibold text-foreground">
              {formatAmount(fallbackMain)}
            </span>
            <span className="text-xs text-muted-foreground">
              payer {payer} → recipient {recipient}
            </span>
            <span className="text-xs text-muted-foreground">
              手数料 {formatAmount(fallbackFee)}
              {operatorShareLabel && facilitatorShareLabel
                ? `（運営 ${operatorShareLabel} / 実行者 ${facilitatorShareLabel}）`
                : ""}
            </span>
            {paymentId ? (
              <span className="text-xs text-muted-foreground">
                Payment ID: {paymentId}
              </span>
            ) : null}
            {executionError ? (
              <span className="text-xs text-yellow-500">
                検証メモ: {executionError}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2 text-xs text-muted-foreground">
            <span>
              登録 {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}
            </span>
            {takenLabel ? <span>開始 {takenLabel}</span> : null}
            {executedLabel ? <span>完了 {executedLabel}</span> : null}
            <JobExecuteButton job={job} onExecuted={onExecuted} />
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <li>
            ジョブID: <code className="break-all">{job.id}</code>
          </li>
          <li>ステータス: {job.status}</li>
          <li>期限: {expiresLabel}</li>
          <li>有効期限: {job.valid_before ?? "不明"}</li>
          {bundleDeadlineLabel ? <li>バンドル期限: {bundleDeadlineLabel}</li> : null}
          {job.taken_by ? <li>処理中: {job.taken_by}</li> : null}
          {job.executed_tx_hash ? (
            <li>
              実行Tx: <code className="break-all">{job.executed_tx_hash}</code>
            </li>
          ) : null}
          {job.fail_reason ? (
            <li className="text-destructive">失敗理由: {job.fail_reason}</li>
          ) : null}
        </ul>
      </div>
    </li>
  );
}

async function fetchJobs(): Promise<JobsResponse> {
  const response = await fetch("/api/jobs?status=pending");

  if (!response.ok) {
    throw new Error("ジョブ一覧の取得に失敗しました");
  }

  return response.json();
}

export default function FacilitatorPage() {
  const {
    data,
    isLoading,
    isFetching,
    error,
    refetch
  } = useQuery({
    queryKey: ["jobs", "pending"],
    queryFn: fetchJobs,
    refetchInterval: 30_000
  });

  const jobs = useMemo<JobRecord[]>(() => data?.jobs ?? [], [data?.jobs]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <Card className="border-border/80 bg-card shadow-md">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>ファシリテーター用ジョブ一覧</CardTitle>
            <CardDescription>
              pending 状態の送金チケットを確認し、Wallet から Executor を実行します。
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "更新中..." : "最新情報に更新"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : error ? (
            <p className="text-sm text-destructive">{(error as Error).message}</p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">pending のジョブはありません。</p>
          ) : (
            <ul className="space-y-3">
              {jobs.map((job) => (
                <JobListItem key={job.id} job={job} onExecuted={() => refetch()} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
