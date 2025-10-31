"use client";

import { useAccount } from "wagmi";

import { CreateJobForm } from "@/components/create-job-form";

export default function EmbedTicketPage() {
  const { address } = useAccount();

  return (
    <main className="flex min-h-screen flex-col bg-background px-4 py-6">
      <div className="mx-auto w-full max-w-xl rounded-xl border border-border/60 bg-card/95 p-4 shadow-lg">
        <CreateJobForm disabled={!address} variant="embed" />
      </div>
    </main>
  );
}
