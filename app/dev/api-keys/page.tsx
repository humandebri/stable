"use client";

import { useCallback, useMemo, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildApiKeyMessage } from "@/lib/security/api-keys";

type DeveloperKey = {
  id: string;
  name: string;
  hashSnippet: string;
  createdAt: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
};

type KeysResponse = {
  keys?: DeveloperKey[];
  error?: string;
};

type CreateKeyResponse = {
  key: string;
  masked: string;
  record: {
    id: string;
    name: string;
    created_at: string;
  };
};

function nowNonce(): string {
  return Date.now().toString();
}

function hashSnippetFromKey(key: string): string {
  return key.slice(0, 12);
}

export default function DeveloperApiKeysPage() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();

  const [createName, setCreateName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const enabled = Boolean(isConnected && address);

  const keysQuery = useQuery<DeveloperKey[]>({
    queryKey: ["dev-api-keys", address],
    enabled,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!address) return [];
      const response = await fetch(`/api/dev/api-keys?address=${address}`);
      const text = await response.text();
      let parsed: KeysResponse = {};
      if (text) {
        try {
          parsed = JSON.parse(text) as KeysResponse;
        } catch {
          parsed = {};
        }
      }
      if (!response.ok) {
        throw new Error(parsed.error ?? "APIキーの取得に失敗しました");
      }
      return parsed.keys ?? [];
    }
  });

  const keys = keysQuery.data ?? [];
  const activeKeys = useMemo(() => keys.filter((key) => !key.revokedAt), [keys]);
  const revokedKeys = useMemo(() => keys.filter((key) => Boolean(key.revokedAt)), [keys]);
  const hasFetched = keysQuery.isFetched;
  const queryError = keysQuery.error as Error | null;
  const displayError = localError ?? queryError?.message ?? null;

  const requireWallet = useCallback(() => {
    if (!address || !isConnected) {
      throw new Error("ウォレットを接続してください。");
    }
    return address as `0x${string}`;
  }, [address, isConnected]);

  const requestSignature = useCallback(
    async (action: "create" | "revoke" | "restore") => {
      const walletAddress = requireWallet();
      const nonce = nowNonce();
      const message = buildApiKeyMessage(action, walletAddress, nonce);
      if (!walletClient) {
        throw new Error("ウォレットの署名クライアントが利用できません。");
      }
      const signature = await walletClient.signMessage({
        account: walletAddress,
        message
      });
      return { walletAddress, nonce, signature };
    },
    [requireWallet, walletClient]
  );

  const createMutation = useMutation<CreateKeyResponse, Error, string>({
    mutationFn: async (name) => {
      const { walletAddress, nonce, signature } = await requestSignature("create");
      const response = await fetch("/api/dev/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          address: walletAddress,
          nonce,
          signature
        })
      });
      const body = await response.json().catch(() => ({} as KeysResponse));
      if (!response.ok) {
        throw new Error((body as KeysResponse).error ?? "APIキーの発行に失敗しました");
      }
      return body as CreateKeyResponse;
    },
    onSuccess: (data) => {
      setGeneratedKey(data.key);
      setShowKeyDialog(true);
      setCreateName("");
      setLocalError(null);
      queryClient.invalidateQueries({ queryKey: ["dev-api-keys", address] });
    },
    onError: (error) => {
      setLocalError(error.message);
    }
  });

  const updateMutation = useMutation<void, Error, { id: string; action: "revoke" | "restore" }>({
    mutationFn: async ({ id, action }) => {
      const { walletAddress, nonce, signature } = await requestSignature(action);
      const response = await fetch(`/api/dev/api-keys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          address: walletAddress,
          nonce,
          signature
        })
      });
      const body = await response.json().catch(() => ({} as KeysResponse));
      if (!response.ok) {
        throw new Error((body as KeysResponse).error ?? "キーの更新に失敗しました");
      }
    },
    onSuccess: () => {
      setLocalError(null);
      queryClient.invalidateQueries({ queryKey: ["dev-api-keys", address] });
    },
    onError: (error) => {
      setLocalError(error.message);
    }
  });

  const handleCreateKey = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setGeneratedKey(null);
      setLocalError(null);

      const trimmed = createName.trim();
      if (!trimmed) {
        setLocalError("キー名を入力してください");
        return;
      }

      createMutation.mutate(trimmed);
    },
    [createMutation, createName]
  );

  const handleUpdateKey = useCallback(
    (id: string, action: "revoke" | "restore") => {
      setLocalError(null);
      updateMutation.mutate({ id, action });
    },
    [updateMutation]
  );

  const handleCopy = useCallback(async () => {
    if (!generatedKey) return;
    try {
      await navigator.clipboard.writeText(generatedKey);
      setCopyFeedback("コピーしました");
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (error) {
      console.error("Failed to copy API key", error);
      setCopyFeedback("コピーに失敗しました");
    }
  }, [generatedKey]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-10">
      <Card className="border-border/70 bg-card/80">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold text-foreground">
            開発者向け API キー管理
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isConnected ? (
            <p className="text-sm text-muted-foreground">
              ウォレットを接続すると、API キーの発行・無効化が行えます。
            </p>
          ) : (
            <>
              <form onSubmit={handleCreateKey} className="space-y-3 rounded-md border border-border/60 bg-background/80 p-4">
                <div className="grid gap-2 sm:grid-cols-[150px_1fr] sm:items-center">
                  <Label htmlFor="apiKeyName">キーの用途</Label>
                  <Input
                    id="apiKeyName"
                    value={createName}
                    onChange={(event) => setCreateName(event.target.value)}
                    placeholder="例: staging backend"
                    required
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" size="sm" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "発行中..." : "APIキーを発行"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    ※新しいキーはモーダルに一度だけ表示されます。安全な場所に保存してください。
                  </p>
                </div>
              </form>
            </>
          )}

          {displayError ? <p className="text-sm text-destructive">{displayError}</p> : null}

          {isConnected ? (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">有効なキー</h2>
              {keysQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">読み込み中...</p>
              ) : !hasFetched ? (
                <p className="text-sm text-muted-foreground">キーの一覧を読み込んでください。</p>
              ) : activeKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">有効なキーはありません。</p>
              ) : (
                <ul className="space-y-3 text-sm text-muted-foreground">
                  {activeKeys.map((key) => (
                    <li
                      key={key.id}
                      className="flex flex-col gap-2 rounded-md border border-border/60 bg-background/80 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-foreground">{key.name}</p>
                        <p className="text-xs">ID: {key.hashSnippet}</p>
                        <p className="text-xs">作成: {new Date(key.createdAt).toLocaleString()}</p>
                        {key.lastUsedAt ? (
                          <p className="text-xs">最終使用: {new Date(key.lastUsedAt).toLocaleString()}</p>
                        ) : (
                          <p className="text-xs">まだ使用されていません</p>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUpdateKey(key.id, "revoke")}
                        disabled={updateMutation.isPending}
                      >
                        無効化
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <h2 className="text-lg font-semibold text-foreground">無効化されたキー</h2>
              {keysQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">読み込み中...</p>
              ) : !hasFetched ? (
                <p className="text-sm text-muted-foreground">キーの一覧を読み込んでください。</p>
              ) : revokedKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">無効化されたキーはありません。</p>
              ) : (
                <ul className="space-y-3 text-sm text-muted-foreground">
                  {revokedKeys.map((key) => (
                    <li
                      key={key.id}
                      className="flex flex-col gap-2 rounded-md border border-dashed border-border/60 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium text-foreground">{key.name}</p>
                        <p className="text-xs">ID: {key.hashSnippet}</p>
                        <p className="text-xs">無効化: {new Date(key.revokedAt as string).toLocaleString()}</p>
                        {key.lastUsedAt ? (
                          <p className="text-xs">最終使用: {new Date(key.lastUsedAt).toLocaleString()}</p>
                        ) : null}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUpdateKey(key.id, "restore")}
                        disabled={updateMutation.isPending}
                      >
                        再有効化
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : null}
        </CardContent>
      </Card>
      <Dialog open={showKeyDialog} onOpenChange={(open) => setShowKeyDialog(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新しい API キー</DialogTitle>
            <DialogDescription>
              下記のキーはこの画面でのみ表示されます。安全な場所に保存してください。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 rounded-md bg-muted px-3 py-2 font-mono text-sm text-foreground">
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {generatedKey ?? "(未発行)"}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={handleCopy}
                aria-label="APIキーをコピー"
              >
                <CopyIcon className="h-4 w-4" />
              </Button>
              {copyFeedback ? (
                <span className="text-xs text-muted-foreground">{copyFeedback}</span>
              ) : null}
            </div>
            <div className="text-xs text-muted-foreground">
              閉じた後に再表示することはできません。必要に応じてメモに控えてください。
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
