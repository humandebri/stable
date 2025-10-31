"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { formatUnits } from "viem";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import type { JobsResponse, JobRecord } from "@/lib/jobs/types";
import { SUPPORTED_CHAINS, getTokensForChain } from "@/lib/tokens";

type JobListItemProps = {
  job: JobRecord;
};

function formatChainName(chainId: number) {
  const chain = SUPPORTED_CHAINS.find((item) => item.id === chainId);
  return chain ? chain.name : `Chain #${chainId}`;
}

function JobListItem({ job }: JobListItemProps) {
  const tokens = getTokensForChain(job.chain_id);
  const token = tokens.find(
    (item) => item.address.toLowerCase() === job.token.toLowerCase()
  );

  const formatAmount = (value: string) => {
    try {
      const formatted = formatUnits(BigInt(value), token?.decimals ?? 18);
      return `${formatted} ${token?.symbol ?? "TOKEN"}`;
    } catch (error) {
      console.warn("Failed to format token amount", error);
      return `${value} (raw)`;
    }
  };

  const expiresAt = job.expires_at ? new Date(job.expires_at) : null;
  const expiresLabel = expiresAt
    ? formatDistanceToNow(expiresAt, { addSuffix: true })
    : "期限情報なし";

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
              {formatAmount(job.main.value)}
            </span>
            <span className="text-xs text-muted-foreground">
              payer {job.main.from} → recipient {job.main.to}
            </span>
            <span className="text-xs text-muted-foreground">
              手数料 {formatAmount(job.fee.value)} → {job.fee.to}
            </span>
          </div>
          <div className="flex flex-col items-end gap-2 text-xs text-muted-foreground">
            <span>登録 {formatDistanceToNow(new Date(job.created_at), { addSuffix: true })}</span>
            {takenLabel ? <span>開始 {takenLabel}</span> : null}
            {executedLabel ? <span>完了 {executedLabel}</span> : null}
            <Button size="sm" variant="outline" disabled className="text-xs">
              実行（準備中）
            </Button>
          </div>
        </div>
        <ul className="grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <li>ジョブID: <code className="break-all">{job.id}</code></li>
          <li>ステータス: {job.status}</li>
          <li>期限: {expiresLabel}</li>
          <li>有効期限: {job.valid_before ?? '不明'}</li>
          {job.taken_by ? (
            <li>処理中: {job.taken_by}</li>
          ) : null}
          {job.executed_tx_hash ? (
            <li>
              実行Tx:
              <code className="break-all">{job.executed_tx_hash}</code>
            </li>
          ) : null}
          {job.fail_reason ? (
            <li className="text-destructive">
              失敗理由: {job.fail_reason}
            </li>
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

  const jobs = useMemo<JobRecord[]>(
    () => data?.jobs ?? [],
    [data?.jobs]
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <Card className="border-border/80 bg-card shadow-xl">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>ファシリテーター用ジョブ一覧</CardTitle>
            <CardDescription>
              pending 状態の送金チケットを確認し、必要に応じて実行します。
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? "更新中..." : "最新情報に更新"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">読み込み中...</p>
          ) : error ? (
            <p className="text-sm text-destructive">
              {(error as Error).message}
            </p>
          ) : jobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              pending のジョブはありません。
            </p>
          ) : (
            <ul className="space-y-3">
              {jobs.map((job) => (
                <JobListItem key={job.id} job={job} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
