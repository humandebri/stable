import { randomBytes, createHash } from "crypto";

const API_KEY_PREFIX = "plk_";

export type ApiKeyAction = "list" | "create" | "revoke" | "restore";

export function generateApiKey(): string {
  const random = randomBytes(24).toString("base64url");
  return `${API_KEY_PREFIX}${random}`;
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").toLowerCase();
}

export function maskApiKey(key: string, visible = 4): string {
  if (key.length <= visible) return key;
  return `${key.slice(0, visible)}…${key.slice(-visible)}`;
}

export function buildApiKeyMessage(
  action: ApiKeyAction,
  address: string,
  nonce: number | string
): string {
  const normalizedAddress = address.toLowerCase();
  return `Paylancer API Key\naction:${action}\naddress:${normalizedAddress}\nnonce:${nonce}`;
}
