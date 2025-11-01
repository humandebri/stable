import { NextResponse } from "next/server";

import { assertInternalRequest } from "@/lib/api/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  try {
    await assertInternalRequest(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const paymentId = searchParams.get("paymentId");
  const jobId = searchParams.get("jobId");

  if (!paymentId && !jobId) {
    return NextResponse.json(
      { error: "paymentId or jobId is required" },
      { status: 400 }
    );
  }

  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("jobs")
    .select(
      "id, payment_id, status, executed_tx_hash, executed_at, fail_reason, bundle_deadline_at, expires_at, created_at"
    )
    .limit(1);

  if (paymentId) {
    query = query.eq("payment_id", paymentId);
  }

  if (jobId) {
    query = query.eq("id", jobId);
  }

  const { data: job, error } = await query.maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to lookup job" }, { status: 500 });
  }

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const { data: events } = await supabase
    .from("job_events")
    .select("id, event_type, status_code, message, created_at")
    .eq("job_id", job.id)
    .order("created_at", { ascending: false })
    .limit(3);

  return NextResponse.json({
    job,
    events: events ?? []
  });
}
