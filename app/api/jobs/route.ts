import { NextResponse } from "next/server";
import { verifyTypedData } from "viem";

import { assertInternalRequest } from "@/lib/api/auth";
import { EXECUTOR_CONTRACT_ADDRESS } from "@/lib/config";
import { buildBundleTypedData } from "@/lib/eip3009";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CreateJobRequest } from "@/lib/jobs/types";
import { logJobEvent } from "@/lib/jobs/events";
import {
  type NormalizedJobPayload,
  validateJobCreatePayload
} from "@/lib/jobs/validation";

type CreateJobPayload = CreateJobRequest;

export async function POST(request: Request) {
  try {
    await assertInternalRequest(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createSupabaseServerClient();
  let jobPayload: CreateJobPayload;

  try {
    jobPayload = await request.json();
  } catch (error) {
    await logJobEvent(supabase, {
      eventType: "validation_failed",
      statusCode: 400,
      message: "Invalid JSON payload"
    });
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const requestedPaymentId =
    jobPayload.paymentId ?? jobPayload.bundle?.paymentId ?? null;
  await logJobEvent(supabase, {
    eventType: "request_received",
    paymentId: requestedPaymentId,
    metadata: {
      chainId: jobPayload.chainId,
      token: jobPayload.token,
      merchantId: jobPayload.merchantId ?? null
    }
  });

  let normalized: NormalizedJobPayload;
  try {
    normalized = validateJobCreatePayload(jobPayload);
  } catch (error) {
    await logJobEvent(supabase, {
      eventType: "validation_failed",
      statusCode: 400,
      message: (error as Error).message,
      paymentId: requestedPaymentId
    });
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (normalized.validBefore <= nowSeconds) {
    await logJobEvent(supabase, {
      eventType: "validation_failed",
      statusCode: 400,
      message: "authorization.validBefore has already passed",
      paymentId: normalized.paymentId
    });
    return NextResponse.json(
      { error: "authorization.validBefore has already passed" },
      { status: 400 }
    );
  }
  if (normalized.validAfter > nowSeconds) {
    await logJobEvent(supabase, {
      eventType: "validation_failed",
      statusCode: 400,
      message: "authorization.validAfter has not started yet",
      paymentId: normalized.paymentId
    });
    return NextResponse.json(
      { error: "authorization.validAfter has not started yet" },
      { status: 400 }
    );
  }
  if (normalized.bundleDeadline <= nowSeconds) {
    await logJobEvent(supabase, {
      eventType: "validation_failed",
      statusCode: 400,
      message: "bundle.deadline has already passed",
      paymentId: normalized.paymentId
    });
    return NextResponse.json(
      { error: "bundle.deadline has already passed" },
      { status: 400 }
    );
  }

  const reservationExpiresAtSeconds = Math.min(
    normalized.validBefore,
    normalized.bundleDeadline
  );
  const reservationExpiresAt = new Date(
    reservationExpiresAtSeconds * 1000
  ).toISOString();
  const timestampNowIso = new Date().toISOString();

  let reservationId: string | null = null;

  const markReservationFailed = async (reason: string) => {
    if (!reservationId) return;
    try {
      await supabase
        .from("job_reservations")
        .update({
          status: "failed",
          job_id: null,
          last_error: reason.slice(0, 500),
          updated_at: new Date().toISOString()
        })
        .eq("id", reservationId);
    } catch (error) {
      console.warn("Failed to mark reservation as failed", error);
    }
  };

  const markReservationCompleted = async (jobId: string) => {
    if (!reservationId) return;
    try {
      await supabase
        .from("job_reservations")
        .update({
          status: "completed",
          job_id: jobId,
          last_error: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", reservationId);
    } catch (error) {
      console.warn("Failed to mark reservation as completed", error);
    }
  };

  const reservationInsertResult = await supabase
    .from("job_reservations")
    .insert({
      payment_id: normalized.paymentId,
      authorization_nonce: normalized.authorization.nonce,
      chain_id: normalized.chainId,
      token: normalized.token,
      wallet_address: normalized.authorization.from,
      merchant_id: normalized.merchantId,
      status: "pending",
      valid_after: normalized.validAfter,
      valid_before: normalized.validBefore,
      bundle_deadline: normalized.bundleDeadline,
      expires_at: reservationExpiresAt,
      created_at: timestampNowIso,
      updated_at: timestampNowIso
    })
    .select()
    .single();

  if (reservationInsertResult.error) {
    const { error } = reservationInsertResult;
    if ("code" in error && error.code === "23505") {
      await logJobEvent(supabase, {
        eventType: "reservation_conflict",
        statusCode: 409,
        message: "Duplicate paymentId or authorization nonce",
        paymentId: normalized.paymentId
      });
      return NextResponse.json(
        { error: "Duplicate paymentId or authorization nonce" },
        { status: 409 }
      );
    }
    console.error("Failed to create job reservation", error);
    await logJobEvent(supabase, {
      eventType: "api_error",
      statusCode: 500,
      message: "Failed to create job reservation",
      paymentId: normalized.paymentId
    });
    return NextResponse.json(
      { error: "Failed to create job reservation" },
      { status: 500 }
    );
  }

  reservationId = reservationInsertResult.data.id as string;

  try {
    const bundleTypedData = buildBundleTypedData(
      EXECUTOR_CONTRACT_ADDRESS as `0x${string}`,
      normalized.chainId,
      {
        payer: normalized.authorization.from as `0x${string}`,
        token: normalized.token,
        recipient: normalized.recipient,
        mainAmount: normalized.mainAmount,
        feeAmount: normalized.feeAmount,
        paymentId: normalized.paymentId,
        deadline: BigInt(normalized.bundleDeadline)
      }
    );

    const signatureValid = await verifyTypedData({
      address: normalized.authorization.from as `0x${string}`,
      domain: bundleTypedData.domain,
      types: bundleTypedData.types,
      primaryType: bundleTypedData.primaryType,
      message: bundleTypedData.message,
      signature: normalized.bundleSignature
    });

    if (!signatureValid) {
      await markReservationFailed("bundle signature verification failed");
      await logJobEvent(supabase, {
        eventType: "validation_failed",
        statusCode: 400,
        message: "bundle signature verification failed",
        paymentId: normalized.paymentId
      });
      return NextResponse.json(
        { error: "bundle signature verification failed" },
        { status: 400 }
      );
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "bundle signature verification failed";
    await markReservationFailed(message);
    await logJobEvent(supabase, {
      eventType: "validation_failed",
      statusCode: 400,
      message,
      paymentId: normalized.paymentId
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("jobs")
      .insert({
        chain_id: normalized.chainId,
        token: normalized.token,
        recipient: normalized.recipient,
        authorization_payload: normalized.authorization,
        main: null,
        fee: null,
        bundle: normalized.bundle,
        bundle_signature: normalized.bundleSignature,
        status: normalized.status,
        payment_id: normalized.paymentId,
        x402_payment_id: normalized.x402PaymentId,
        valid_before: normalized.validBefore,
        expires_at: normalized.expiresAt.toISOString(),
        bundle_deadline: normalized.bundleDeadline,
        bundle_deadline_at: new Date(
          normalized.bundleDeadline * 1000
        ).toISOString(),
        main_amount: normalized.mainAmount.toString(),
        fee_amount: normalized.feeAmount.toString()
      })
      .select()
      .single();

    if (error) {
      await markReservationFailed(error.message ?? "failed to save job");
      await logJobEvent(supabase, {
        eventType: "api_error",
        statusCode: 500,
        message: error.message ?? "Failed to save job",
        paymentId: normalized.paymentId
      });
      throw error;
    }

    await markReservationCompleted(data.id as string);
    await logJobEvent(supabase, {
      eventType: "job_saved",
      statusCode: 201,
      jobId: data.id as string,
      paymentId: normalized.paymentId
    });

    return NextResponse.json({ job: data }, { status: 201 });
  } catch (error) {
    console.error("Failed to insert job", error);
    await logJobEvent(supabase, {
      eventType: "api_error",
      statusCode: 500,
      message: error instanceof Error ? error.message : "Failed to save job",
      paymentId: normalized.paymentId
    });
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save job"
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    await assertInternalRequest(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);

  try {
    const supabase = createSupabaseServerClient();
    let query = supabase.from("jobs").select("*");

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .limit(Number.isNaN(limit) ? 50 : Math.max(1, Math.min(limit, 200)));

    if (error) {
      throw error;
    }

    return NextResponse.json({ jobs: data ?? [] });
  } catch (error) {
    console.error("Failed to fetch jobs", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}
