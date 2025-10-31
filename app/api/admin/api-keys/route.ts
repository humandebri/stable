import { NextResponse } from "next/server";

import { assertAdminRequest } from "@/lib/api/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  generateApiKey,
  hashApiKey,
  maskApiKey
} from "@/lib/security/api-keys";

export async function GET(request: Request) {
  try {
    await assertAdminRequest(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, created_at, created_by, last_used_at, revoked_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch api keys", error);
    return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
  }

  return NextResponse.json({ keys: data ?? [] });
}

export async function POST(request: Request) {
  try {
    await assertAdminRequest(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: { name?: string; createdBy?: string | null };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!payload.name || payload.name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      name: payload.name.trim(),
      key_hash: keyHash,
      created_by: payload.createdBy ?? null
    })
    .select("id, name, created_at, created_by")
    .single();

  if (error) {
    console.error("Failed to create api key", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }

  return NextResponse.json(
    {
      key: apiKey,
      masked: maskApiKey(apiKey),
      record: data
    },
    { status: 201 }
  );
}
