import { NextResponse } from "next/server";

import { isAddress, getAddress } from "viem";

import { assertDeveloperSignature } from "@/lib/api/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  generateApiKey,
  hashApiKey,
  maskApiKey,
  type ApiKeyAction
} from "@/lib/security/api-keys";

type KeyRecord = {
  id: string;
  name: string;
  key_hash: string;
  created_at: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
};

function sanitizeName(name: unknown): string {
  if (!name || typeof name !== "string") {
    throw new Error("name is required");
  }

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error("name is required");
  }

  return trimmed.slice(0, 100);
}

function parseString(value: string | null): string {
  if (!value) {
    throw new Error("Invalid parameter");
  }
  return value;
}

function parseAction(value: unknown, fallback: ApiKeyAction): ApiKeyAction {
  if (value === "revoke" || value === "restore" || value === "create" || value === "list") {
    return value;
  }
  return fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const addressParam = url.searchParams.get("address");
    if (!addressParam || !isAddress(addressParam)) {
      throw new Error("Invalid address");
    }

    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
      throw new Error("Forbidden");
    }

    const normalizedAddress = getAddress(addressParam).toLowerCase();

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("api_keys")
      .select("id, name, key_hash, created_at, last_used_at, revoked_at")
      .eq("created_by", normalizedAddress)
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const keys = (data ?? []).map((record) => ({
      id: record.id,
      name: record.name,
      hashSnippet: record.key_hash.slice(0, 12),
      createdAt: record.created_at,
      lastUsedAt: record.last_used_at,
      revokedAt: record.revoked_at
    }));

    return NextResponse.json({ keys });
  } catch (error) {
    console.error("Failed to fetch developer api keys", error);
    const status = error instanceof Error && error.message === "Forbidden" ? 403 : 400;
    return NextResponse.json({ error: "Failed to fetch keys" }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const name = sanitizeName(payload.name);
    const address = parseString(payload.address ?? payload.walletAddress ?? null);
    const nonce = parseString(payload.nonce?.toString?.() ?? payload.nonce ?? null);
    const signature = parseString(payload.signature ?? null);

    const normalizedAddress = await assertDeveloperSignature({
      action: "create",
      address,
      nonce,
      signature
    });

    const apiKey = generateApiKey();
    const keyHash = hashApiKey(apiKey);

    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        name,
        key_hash: keyHash,
        created_by: normalizedAddress
      })
      .select("id, name, created_at")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json(
      {
        key: apiKey,
        masked: maskApiKey(apiKey),
        record: data
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create developer api key", error);
    const status = error instanceof Error && error.message === "Signature expired" ? 400 : 500;
    return NextResponse.json({ error: "Failed to create key" }, { status });
  }
}
