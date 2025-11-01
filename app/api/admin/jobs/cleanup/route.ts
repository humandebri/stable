import { NextResponse } from "next/server";

import { assertAdminRequest } from "@/lib/api/auth";
import { logJobEvent } from "@/lib/jobs/events";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type CleanupSummary = {
  expiredJobs: number;
  expiredReservations: number;
  deletedReservations: number;
};

export async function POST(request: Request) {
  try {
    await assertAdminRequest(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();
  const nowIso = new Date().toISOString();

  const summary: CleanupSummary = {
    expiredJobs: 0,
    expiredReservations: 0,
    deletedReservations: 0
  };

  const { data: expiredJobs, error: expireJobsError } = await supabase
    .from("jobs")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lte("expires_at", nowIso)
    .select("id, payment_id");

  if (expireJobsError) {
    return NextResponse.json(
      { error: "Failed to expire jobs" },
      { status: 500 }
    );
  }

  summary.expiredJobs = expiredJobs?.length ?? 0;

  const { data: expiredReservations, error: expireReservationsError } =
    await supabase
      .from("job_reservations")
      .update({
        status: "expired",
        updated_at: nowIso
      })
      .eq("status", "pending")
      .lt("expires_at", nowIso)
      .select("id, payment_id");

  if (expireReservationsError) {
    return NextResponse.json(
      { error: "Failed to expire reservations" },
      { status: 500 }
    );
  }

  summary.expiredReservations = expiredReservations?.length ?? 0;

  const deleteThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: deletedReservations, error: deleteReservationsError } =
    await supabase
      .from("job_reservations")
      .delete()
      .lt("expires_at", deleteThreshold)
      .in("status", ["completed", "failed", "expired"])
      .select("id, payment_id");

  if (deleteReservationsError) {
    return NextResponse.json(
      { error: "Failed to delete old reservations" },
      { status: 500 }
    );
  }

  summary.deletedReservations = deletedReservations?.length ?? 0;

  await logJobEvent(supabase, {
    eventType: "cleanup_action",
    statusCode: 200,
    message: "jobs cleanup completed",
    metadata: summary
  });

  return NextResponse.json({ summary });
}
