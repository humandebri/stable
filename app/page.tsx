/* eslint-disable react/jsx-no-bind */
"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWalletClient
} from "wagmi";

import { CreateJobForm } from "@/components/create-job-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";

function truncateAddress(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { address, chainId, status: accountStatus } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { disconnect } = useDisconnect();
  const {
    connect,
    connectors,
    status: connectStatus,
    error: connectError,
    isPending
  } = useConnect();

  const { chains, switchChain, isPending: isSwitching, error: switchError } =
    useSwitchChain();

  const availableConnectors = connectors.filter(
    (connector) => connector.id !== "injected-fallback"
  );
  const walletConnectConnector = availableConnectors.find(
    (connector) => connector.id === "walletConnect"
  );
  const otherConnectors = availableConnectors.filter(
    (connector) => connector.id !== "walletConnect"
  );
  const preferredConnector =
    availableConnectors.find(
      (connector) => connector.id === "injected" && connector.ready
    ) ??
    walletConnectConnector ??
    availableConnectors.find((connector) => connector.ready) ??
    availableConnectors[0];

  const handlePreferredConnect = () => {
    if (!preferredConnector) return;
    connect({ connector: preferredConnector });
  };

  if (!mounted) {
    return null;
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">
              ウォレット接続
            </h2>
            {address ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-3 py-1 font-semibold uppercase tracking-wide text-muted-foreground">
                  {accountStatus}
                </span>
                <span className="rounded-md bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
                  {truncateAddress(address)}
                </span>
              </div>
            ) : null}
          </div>

          {address ? (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => disconnect()}
            >
              切断する
            </Button>
          ) : null}
        </div>

        {address ? (
          <div className="flex flex-col gap-3 text-sm text-muted-foreground">
            {switchChain ? (
              <div className="flex flex-wrap items-center gap-2">
                {chains.map((chain) => (
                  <Button
                    key={chain.id}
                    type="button"
                    variant={chain.id === chainId ? "default" : "outline"}
                    size="sm"
                    onClick={() => switchChain({ chainId: chain.id })}
                    disabled={chain.id === chainId || isSwitching}
                  >
                    {chain.name}
                  </Button>
                ))}
              </div>
            ) : null}

            {switchError ? (
              <p className="text-destructive text-xs">{switchError.message}</p>
            ) : null}
          </div>
        ) : (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                size="sm"
                type="button"
                disabled={!preferredConnector || isPending}
                className="w-full sm:w-auto sm:px-4"
              >
                {isPending ? "接続中..." : "ウォレット接続"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>ウォレットを選択</DialogTitle>
                <DialogDescription>
                  対応ウォレット一覧から接続方法を選択してください。
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-2 text-sm">
                {["WalletConnect", "Injected", "Coinbase Wallet", "Rabby Wallet"].map(
                  (label) => {
                    const connector =
                      label === "WalletConnect"
                        ? walletConnectConnector
                        : availableConnectors.find(
                            (c) =>
                              c.name === label ||
                              c.id === label.toLowerCase().replace(/\s+/g, "-")
                          );

                    const isSupported = Boolean(connector);

                    return (
                      <Button
                        key={label}
                        size="sm"
                        type="button"
                        variant="outline"
                        className="justify-between"
                        disabled={!isSupported || isPending}
                        onClick={() => connector && connect({ connector })}
                      >
                        <span>{label}</span>
                        <span className="text-xs text-muted-foreground">
                          {connector?.id ?? "not available"}
                        </span>
                      </Button>
                    );
                  }
                )}

                {!walletConnectConnector && otherConnectors.length === 0 ? (
                  <p className="text-muted-foreground">
                    利用可能なウォレットが見つかりません。ブラウザ拡張やウォレットアプリを確認してください。
                  </p>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">
                接続状態:{" "}
                <code className="rounded bg-muted px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {connectStatus}
                </code>
              </p>
              {connectError ? (
                <p className="text-destructive text-xs">
                  {connectError.message}
                </p>
              ) : null}
            </DialogContent>
          </Dialog>
        )}
      </section>

      <Card className="border-border/80 bg-card shadow-xl">
        <CardContent>
          <CreateJobForm disabled={!address} />
        </CardContent>
      </Card>
    </main>
  );
}
