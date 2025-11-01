import type { SupabaseClient } from "@supabase/supabase-js";

export type LogJobEventInput = {
  eventType: string;
  statusCode?: number | null;
  message?: string | null;
  jobId?: string | null;
  paymentId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function logJobEvent(
  client: SupabaseClient,
  { eventType, statusCode = null, message = null, jobId = null, paymentId = null, metadata = null }: LogJobEventInput
) {
  try {
    await client.from("job_events").insert({
      event_type: eventType,
      status_code: statusCode,
      message,
      job_id: jobId,
      payment_id: paymentId,
      metadata
    });
  } catch (error) {
    console.warn("Failed to log job event", eventType, error);
  }
}
