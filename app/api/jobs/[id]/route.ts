import { NextResponse } from "next/server";

import { assertInternalRequest } from "@/lib/api/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type JobStatus =
  | "pending"
  | "processing"
  | "executed"
  | "failed"
  | "cancelled"
  | "expired";

type PatchPayload = {
  status: JobStatus;
  executedTxHash?: string | null;
  failReason?: string | null;
  facilitator?: string | null;
};

const ALLOWED_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  pending: ["processing", "executed", "failed", "cancelled"],
  processing: ["executed", "failed"],
  executed: [],
  failed: [],
  cancelled: [],
  expired: []
};

function isAddress(value: string | null | undefined) {
  return Boolean(value && value.startsWith("0x") && value.length === 42);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    assertInternalRequest(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let payload: PatchPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!payload.status) {
    return NextResponse.json({ error: "status is required" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();
  const { data: job, error: fetchError } = await supabase
    .from("jobs")
    .select("status, taken_by")
    .eq("id", params.id)
    .single();

  if (fetchError) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const currentStatus = job.status as JobStatus;
  const nextStatus = payload.status;

  if (!ALLOWED_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
    return NextResponse.json(
      {
        error: `Transition from ${currentStatus} to ${nextStatus} is not allowed`
      },
      { status: 409 }
    );
  }

  const updates: Record<string, unknown> = {
    status: nextStatus
  };

  const facilitator = payload.facilitator ?? null;

  if (nextStatus === "processing") {
    if (!isAddress(facilitator)) {
      return NextResponse.json(
        { error: "facilitator address is required for processing status" },
        { status: 400 }
      );
    }

    updates.taken_at = new Date().toISOString();
    updates.taken_by = facilitator;
    updates.fail_reason = null;
  }

  if (nextStatus === "executed") {
    const txHash = payload.executedTxHash;
    if (!txHash) {
      return NextResponse.json(
        { error: "executedTxHash is required when marking executed" },
        { status: 400 }
      );
    }

    updates.executed_tx_hash = txHash;
    updates.executed_at = new Date().toISOString();
    updates.fail_reason = null;

    if (isAddress(facilitator) && !job.taken_by) {
      updates.taken_by = facilitator;
    }

    if (!job.taken_by && !updates.taken_by) {
      updates.taken_by = facilitator;
    }
  }

  if (nextStatus === "failed") {
    const reason = payload.failReason;
    if (!reason) {
      return NextResponse.json(
        { error: "failReason is required when marking failed" },
        { status: 400 }
      );
    }

    updates.fail_reason = reason;
    updates.executed_tx_hash = null;
    updates.executed_at = null;
  }

  if (nextStatus === "cancelled") {
    updates.fail_reason = payload.failReason ?? null;
    updates.executed_tx_hash = null;
    updates.executed_at = null;
  }

  const { data: updated, error: updateError } = await supabase
    .from("jobs")
    .update(updates)
    .eq("id", params.id)
    .eq("status", currentStatus)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to update job status" },
      { status: 500 }
    );
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Job status was updated by another process" },
      { status: 409 }
    );
  }

  return NextResponse.json({ job: updated });
}
