"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

import { Button } from "@/components/ui/button";
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

export function Navbar() {
  const { address, status: accountStatus, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const {
    connect,
    connectors,
    error: connectError,
    isPending,
    status: connectStatus
  } = useConnect();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const availableConnectors = connectors.filter(
    (connector) => connector.id !== "injected-fallback"
  );
  const walletConnectConnector = availableConnectors.find(
    (connector) => connector.id === "walletConnect"
  );
  const preferredConnector = useMemo(() => {
    return (
      availableConnectors.find(
        (connector) => connector.id === "injected" && connector.ready
      ) ??
      walletConnectConnector ??
      availableConnectors.find((connector) => connector.ready) ??
      availableConnectors[0]
    );
  }, [availableConnectors, walletConnectConnector]);

  const showAccountInfo = mounted && !!address;


  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-4 text-sm font-medium">
          <Link href="/" className="text-foreground hover:text-foreground/80">
            Paylancer
          </Link>
          <nav className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link
              href="/jobs"
              className="rounded-md px-2 py-1 hover:bg-muted hover:text-foreground"
            >
              ユーザー
            </Link>
            <Link
              href="/facilitator"
              className="rounded-md px-2 py-1 hover:bg-muted hover:text-foreground"
            >
              ファシリテーター
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {showAccountInfo ? (
            <>
              <span className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 font-semibold uppercase tracking-wide text-muted-foreground">
                {accountStatus}
              </span>
              <span className="rounded-md bg-secondary px-3 py-1 text-sm font-medium text-secondary-foreground">
                {truncateAddress(address)}
              </span>
              {chainId ? (
                <span className="hidden sm:block rounded-md border border-border px-3 py-1 text-sm text-foreground">
                  Chain #{chainId}
                </span>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => disconnect()}
              >
                切断
              </Button>
            </>
          ) : (
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  type="button"
                  disabled={!mounted || !preferredConnector || isPending}
                  className="sm:w-auto sm:px-4"
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

                  {!walletConnectConnector && availableConnectors.length === 0 ? (
                    <p className="text-muted-foreground">
                      利用可能なウォレットが見つかりません。ブラウザ拡張やウォレットアプリを確認してください。
                    </p>
                  ) : null}
                </div>

                {connectError ? (
                  <p className="text-xs text-destructive">
                    {connectError.message}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  接続状態:{" "}
                  <code className="rounded bg-muted px-2 py-1 text-xs uppercase tracking-wide text-muted-foreground">
                    {connectStatus}
                  </code>
                </p>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

    </header>
  );
}
