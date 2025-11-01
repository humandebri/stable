"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useWaitForTransactionReceipt } from "wagmi";
import type { Hex } from "viem";
import type { PublicClient, WalletClient } from "viem";

import { executeJob } from "@/lib/jobs/executor";
import type { JobRecord } from "@/lib/jobs/types";

type UseExecuteJobOptions = {
  job: JobRecord;
  walletClient: WalletClient;
  publicClient?: PublicClient;
  executor: `0x${string}`;
};

type ExecuteJobResult = {
  execute: () => Promise<Hex>;
  reset: () => void;
  receipt: ReturnType<typeof useWaitForTransactionReceipt>["data"];
  isLoading: boolean;
  error: Error | null; // mutate と wait の両方のエラーを統合
  txHash: Hex | undefined;
};

export function useExecuteJob({
  job,
  walletClient,
  publicClient,
  executor
}: UseExecuteJobOptions): ExecuteJobResult {
  const [hash, setHash] = useState<Hex | undefined>();

  const mutation = useMutation({
    mutationFn: async () => {
      const txHash = await executeJob({
        walletClient,
        publicClient,
        executor,
        job
      });
      setHash(txHash);
      return txHash;
    }
  });

  const receiptQuery = useWaitForTransactionReceipt({
    hash,
    chainId: job.chain_id,
    query: {
      enabled: Boolean(hash)
    }
  });

  const execute = () => mutation.mutateAsync();

  const reset = () => {
    setHash(undefined);
    mutation.reset();
  };

  return {
    execute,
    reset,
    receipt: receiptQuery.data,
    isLoading: mutation.isPending || receiptQuery.isLoading,
    error: (mutation.error as Error | null) ?? (receiptQuery.error as Error | null) ?? null,
    txHash: hash
  };
}
