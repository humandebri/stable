"use client";

import { useCallback, useMemo, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  keys: DeveloperKey[];
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

const SIGNATURE_MESSAGE_WINDOW_MS = 5 * 60 * 1000;

function nowNonce(): string {
  return Date.now().toString();
}

function hashSnippetFromKey(key: string): string {
  return key.slice(0, 12);
}

export default function DeveloperApiKeysPage() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [keys, setKeys] = useState<DeveloperKey[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createName, setCreateName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);

  const activeKeys = useMemo(
    () => keys.filter((key) => !key.revokedAt),
    [keys]
  );

  const revokedKeys = useMemo(
    () => keys.filter((key) => Boolean(key.revokedAt)),
    [keys]
  );

  const requireWallet = useCallback(() => {
    if (!address || !isConnected) {
      throw new Error("ウォレットを接続してください。");
    }
    return address as `0x${string}`;
  }, [address, isConnected]);

  const requestSignature = useCallback(
    async (action: "list" | "create" | "revoke" | "restore") => {
      const walletAddress = requireWallet();
      const nonce = nowNonce();
      const message = buildApiKeyMessage(action, walletAddress, nonce);
      const signature = await signMessageAsync({ message });
      return { walletAddress, nonce, signature };
    },
    [requireWallet, signMessageAsync]
  );

  const fetchKeys = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { walletAddress, nonce, signature } = await requestSignature("list");
      const params = new URLSearchParams({
        address: walletAddress,
        nonce,
        signature
      });

      const response = await fetch(`/api/dev/api-keys?${params.toString()}`);
      if (!response.ok) {
        throw new Error("APIキーの取得に失敗しました");
      }
      const data = (await response.json()) as KeysResponse;
      setKeys(data.keys ?? []);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error ? fetchError.message : "APIキーの取得に失敗しました"
      );
    } finally {
      setIsLoading(false);
    }
  }, [requestSignature]);

  const handleCreateKey = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setGeneratedKey(null);
      setError(null);

      const trimmed = createName.trim();
      if (!trimmed) {
        setError("キー名を入力してください");
        return;
      }

      try {
      const { walletAddress, nonce, signature } = await requestSignature("create");
      const response = await fetch("/api/dev/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
            address: walletAddress,
            nonce,
            signature
          })
        });

        if (!response.ok) {
          const json = await response.json().catch(() => ({}));
          throw new Error(json.error ?? "APIキーの発行に失敗しました");
        }

        const data = (await response.json()) as CreateKeyResponse;
        setGeneratedKey(data.key);
        setCreateName("");
        setKeys((prev) => [
          {
            id: data.record.id,
            name: data.record.name,
            hashSnippet: hashSnippetFromKey(data.key),
            createdAt: data.record.created_at,
            lastUsedAt: null,
            revokedAt: null
          },
          ...prev
        ]);
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : "APIキーの発行に失敗しました"
        );
      }
    },
    [createName, fetchKeys, requestSignature]
  );

  const handleUpdateKey = useCallback(
    async (id: string, action: "revoke" | "restore") => {
      try {
        setError(null);
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

        if (!response.ok) {
          const json = await response.json().catch(() => ({}));
          throw new Error(json.error ?? "キーの更新に失敗しました");
        }

        await fetchKeys();
      } catch (updateError) {
        setError(
          updateError instanceof Error
            ? updateError.message
            : "キーの更新に失敗しました"
        );
      }
    },
    [fetchKeys, requestSignature]
  );

  const handleLoadKeys = useCallback(() => {
    fetchKeys();
  }, [fetchKeys]);

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
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="outline" onClick={handleLoadKeys} disabled={isLoading}>
                  {isLoading ? "読み込み中..." : "キー一覧を読み込む"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  署名ウィンドウは {SIGNATURE_MESSAGE_WINDOW_MS / 60000} 分以内に更新する必要があります。
                </p>
              </div>

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
                  <Button type="submit" size="sm">
                    APIキーを発行
                  </Button>
                  {generatedKey ? (
                    <span className="rounded-md bg-muted px-3 py-1 text-xs font-mono text-foreground">
                      {generatedKey}
                    </span>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    ※キーは発行時にのみ表示されます。安全な場所に保存してください。
                  </p>
                </div>
              </form>
            </>
          )}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {isConnected ? (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold text-foreground">有効なキー</h2>
              {activeKeys.length === 0 ? (
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
                      >
                        無効化
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              <h2 className="text-lg font-semibold text-foreground">無効化されたキー</h2>
              {revokedKeys.length === 0 ? (
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
    </main>
  );
}
