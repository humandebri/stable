import { NextResponse } from "next/server";

import { assertDeveloperSignature } from "@/lib/api/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type UpdatePayload = {
  address: string;
  nonce: number | string;
  signature: string;
  action?: "revoke" | "restore";
};

function parseAction(action: string | undefined): "revoke" | "restore" {
  if (action === "restore") return "restore";
  return "revoke";
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  let payload: UpdatePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const action = parseAction(payload.action);

  try {
    const normalizedAddress = await assertDeveloperSignature({
      action,
      address: payload.address,
      nonce: payload.nonce,
      signature: payload.signature
    });

    const supabase = createSupabaseServerClient();
    const { data: existing, error: selectError } = await supabase
      .from("api_keys")
      .select("id, created_by")
      .eq("id", params.id)
      .maybeSingle();

    if (selectError || !existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if ((existing.created_by ?? "").toLowerCase() !== normalizedAddress) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updates =
      action === "restore"
        ? { revoked_at: null }
        : { revoked_at: new Date().toISOString() };

    const { data, error } = await supabase
      .from("api_keys")
      .update(updates)
      .eq("id", params.id)
      .select("id, name, key_hash, created_at, last_used_at, revoked_at")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ key: data });
  } catch (error) {
    console.error("Failed to update developer api key", error);
    return NextResponse.json({ error: "Failed to update key" }, { status: 400 });
  }
}
