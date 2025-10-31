"use client";

import { useAccount } from "wagmi";

import { CreateJobForm } from "@/components/create-job-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

export default function HomePage() {
  const { address } = useAccount();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 py-10">
      <Card className="border-border/80 bg-card shadow-xl">
        <CardContent>
          <CreateJobForm disabled={!address} />
        </CardContent>
      </Card>
    </main>
  );
}
