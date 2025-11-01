"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";

import { CreateJobFormEmbed } from "@/components/create-job-form/index";
import { TicketShell } from "@/components/embed/ticket-shell";

export const dynamic = "force-dynamic";

type PrefillConfig = {
  prefill: {
    tokenAddress?: `0x${string}`;
    recipient?: `0x${string}`;
    amount?: string;
    feeAmount?: string;
  };
  lock: {
    token: boolean;
    recipient: boolean;
    amount: boolean;
    feeAmount: boolean;
  };
};

function EmbedTicketForm({ isWalletConnected }: { isWalletConnected: boolean }) {
  const searchParams = useSearchParams();

  const { prefill, lock } = useMemo<PrefillConfig>(() => {
    const tokenAddress = searchParams.get("token");
    const recipient = searchParams.get("recipient");
    const amount = searchParams.get("amount");
    const feeAmount = searchParams.get("fee");

    const normalizeAddress = (value: string | null) => {
      if (!value) return undefined;
      const trimmed = value.trim();
      if (!trimmed.startsWith("0x")) return undefined;
      if (trimmed.length !== 42) return undefined;
      return trimmed.toLowerCase() as `0x${string}`;
    };

    const normalizedToken = normalizeAddress(tokenAddress);
    const normalizedRecipient = normalizeAddress(recipient);

    const prefillConfig: {
      tokenAddress?: `0x${string}`;
      recipient?: `0x${string}`;
      amount?: string;
      feeAmount?: string;
    } = {};

    if (normalizedToken) {
      prefillConfig.tokenAddress = normalizedToken;
    }
    if (normalizedRecipient) {
      prefillConfig.recipient = normalizedRecipient;
    }
    if (amount) {
      prefillConfig.amount = amount;
    }
    if (feeAmount) {
      prefillConfig.feeAmount = feeAmount;
    }

    return {
      prefill: {
        ...prefillConfig
      },
      lock: {
        token: Boolean(normalizedToken),
        recipient: Boolean(normalizedRecipient),
        amount: Boolean(amount),
        feeAmount: Boolean(feeAmount)
      }
    };
  }, [searchParams]);

  return <CreateJobFormEmbed disabled={!isWalletConnected} prefill={prefill} lock={lock} />;
}

export default function EmbedTicketPage() {
  const { address } = useAccount();

  return (
    <TicketShell>
      <Suspense
        fallback={
          <div className="flex min-h-[320px] items-center justify-center text-sm text-muted-foreground">
            フォームを読み込んでいます…
          </div>
        }
      >
        <EmbedTicketForm isWalletConnected={Boolean(address)} />
      </Suspense>
    </TicketShell>
  );
}
