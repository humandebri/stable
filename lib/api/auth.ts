import { isAddress, verifyMessage } from "viem";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  hashApiKey,
  buildApiKeyMessage,
  type ApiKeyAction
} from "@/lib/security/api-keys";

const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;
const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

type AssertOptions = {
  requireInternalSecret?: boolean;
  allowApiKeys?: boolean;
};

export async function assertInternalRequest(
  request: Request,
  options: AssertOptions = {}
) {
  const { requireInternalSecret = false, allowApiKeys = true } = options;

  const fetchSite = request.headers.get("sec-fetch-site");
  const isSameOrigin =
    fetchSite && (fetchSite === "same-origin" || fetchSite === "same-site");

  if (!requireInternalSecret && isSameOrigin) {
    return;
  }

  const providedInternal = request.headers.get("x-internal-api-key");
  if (providedInternal && INTERNAL_API_SECRET && providedInternal === INTERNAL_API_SECRET) {
    return;
  }

  if (requireInternalSecret) {
    throw new Error("Forbidden");
  }

  if (!allowApiKeys) {
    throw new Error("Forbidden");
  }

  const providedApiKey = request.headers.get("x-api-key");
  if (!providedApiKey) {
    throw new Error("Forbidden");
  }

  const hashed = hashApiKey(providedApiKey);
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, revoked_at")
    .eq("key_hash", hashed)
    .maybeSingle();

  if (error || !data || data.revoked_at) {
    throw new Error("Forbidden");
  }

  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
}

export async function assertAdminRequest(request: Request) {
  await assertInternalRequest(request, { requireInternalSecret: true });
}

type DeveloperSignaturePayload = {
  action: ApiKeyAction;
  address: string;
  nonce: number | string;
  signature: string;
};

export async function assertDeveloperSignature({
  action,
  address,
  nonce,
  signature
}: DeveloperSignaturePayload): Promise<string> {
  if (!address || !isAddress(address)) {
    throw new Error("Invalid address");
  }

  const normalizedAddress = address.toLowerCase() as `0x${string}`;
  const parsedNonce = typeof nonce === "number" ? nonce : Number(nonce);

  if (!Number.isFinite(parsedNonce)) {
    throw new Error("Invalid nonce");
  }

  if (Math.abs(Date.now() - parsedNonce) > SIGNATURE_WINDOW_MS) {
    throw new Error("Signature expired");
  }

  if (!signature || !signature.startsWith("0x")) {
    throw new Error("Invalid signature");
  }

  const message = buildApiKeyMessage(action, normalizedAddress, parsedNonce);
  const verified = await verifyMessage({
    address: normalizedAddress,
    message,
    signature: signature as `0x${string}`
  });

  if (!verified) {
    throw new Error("Signature verification failed");
  }

  return normalizedAddress;
}
