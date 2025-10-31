import { NextResponse } from "next/server";

import { assertAdminRequest } from "@/lib/api/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await assertAdminRequest(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: { action?: "revoke" | "restore" };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const action = payload.action ?? "revoke";
  const supabase = createSupabaseServerClient();

  const updates =
    action === "restore"
      ? { revoked_at: null }
      : { revoked_at: new Date().toISOString() };

  const { data, error } = await supabase
    .from("api_keys")
    .update(updates)
    .eq("id", params.id)
    .select("id, name, revoked_at, last_used_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to update key" }, { status: 500 });
  }

  return NextResponse.json({ key: data });
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await assertAdminRequest(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("api_keys")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete key" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
