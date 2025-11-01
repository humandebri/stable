import { NextResponse } from "next/server";
import { verifyTypedData } from "viem";

import { assertInternalRequest } from "@/lib/api/auth";
import { EXECUTOR_CONTRACT_ADDRESS } from "@/lib/config";
import { buildBundleTypedData, normalizePaymentId } from "@/lib/eip3009";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AuthorizationRecord,
  BundleRecord,
  CreateJobRequest
} from "@/lib/jobs/types";
import { findTokenConfig, getTokenAmountLimits } from "@/lib/tokens";
import type { SupportedTokenConfig } from "@/lib/tokens";
import { logJobEvent } from "@/lib/jobs/events";

type AuthorizationPayload = {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string | number | bigint;
  validAfter: string | number | bigint;
  validBefore: string | number | bigint;
  nonce: string;
  signature: string;
  v?: number;
  r?: string;
  s?: string;
};

type CreateJobPayload = CreateJobRequest;

type NormalizedJobPayload = {
  chainId: number;
  token: `0x${string}`;
  tokenConfig: SupportedTokenConfig;
  recipient: `0x${string}`;
  authorization: AuthorizationRecord;
  bundle: BundleRecord;
  bundleSignature: `0x${string}`;
  bundleDeadline: number;
  mainAmount: bigint;
  feeAmount: bigint;
  status: string;
  paymentId: `0x${string}`;
  x402PaymentId: string | null;
  merchantId: string | null;
  validBefore: number;
  validAfter: number;
  expiresAt: Date;
};

function toStringValue(value: string | number | bigint) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") return Math.trunc(value).toString();
  return value;
}

function normalizeAuthorization(auth: AuthorizationPayload): AuthorizationRecord {
  const required = [
    auth.from,
    auth.to,
    auth.value,
    auth.validAfter,
    auth.validBefore,
    auth.nonce,
    auth.signature
  ];

  if (required.some((value) => value === undefined || value === null)) {
    throw new Error("Authorization payload is missing required fields");
  }

  if (typeof auth.nonce !== "string" || !auth.nonce.startsWith("0x") || auth.nonce.length !== 66) {
    throw new Error("authorization.nonce must be a 32-byte hex string");
  }

  if (
    auth.signature &&
    (typeof auth.signature !== "string" ||
      !auth.signature.startsWith("0x") ||
      auth.signature.length !== 132)
  ) {
    throw new Error("authorization.signature must be a 65-byte hex string");
  }

  return {
    from: auth.from,
    to: auth.to,
    value: toStringValue(auth.value),
    validAfter: toStringValue(auth.validAfter),
    validBefore: toStringValue(auth.validBefore),
    nonce: auth.nonce,
    signature: auth.signature,
    v: auth.v,
    r: auth.r,
    s: auth.s
  };
}

function normalizeBundle(bundle: BundleRecord | null | undefined): BundleRecord {
  if (!bundle) {
    throw new Error("bundle payload is required");
  }

  const required = [
    bundle.payer,
    bundle.token,
    bundle.recipient,
    bundle.mainAmount,
    bundle.feeAmount,
    bundle.paymentId,
    bundle.deadline
  ];

  if (required.some((value) => value === undefined || value === null)) {
    throw new Error("bundle payload is missing required fields");
  }

  const payer = bundle.payer as `0x${string}`;
  const token = bundle.token as `0x${string}`;
  const recipient = bundle.recipient as `0x${string}`;

  if (!payer.startsWith("0x") || payer.length !== 42) {
    throw new Error("bundle.payer must be a valid address");
  }
  if (!token.startsWith("0x") || token.length !== 42) {
    throw new Error("bundle.token must be a valid address");
  }
  if (!recipient.startsWith("0x") || recipient.length !== 42) {
    throw new Error("bundle.recipient must be a valid address");
  }

  const normalizedPaymentId = normalizePaymentId(bundle.paymentId);

  return {
    payer,
    token,
    recipient,
    mainAmount: toStringValue(bundle.mainAmount),
    feeAmount: toStringValue(bundle.feeAmount),
    paymentId: normalizedPaymentId,
    deadline: toStringValue(bundle.deadline)
  };
}

export function validatePayload(payload: CreateJobPayload): NormalizedJobPayload {
  if (typeof payload.chainId !== "number" || Number.isNaN(payload.chainId)) {
    throw new Error("chainId must be a number");
  }

  if (!payload.token) {
    throw new Error("token is required");
  }

  const token = payload.token as `0x${string}`;
  if (!token.startsWith("0x") || token.length !== 42) {
    throw new Error("token must be a valid address");
  }

  if (!payload.recipient) {
    throw new Error("recipient is required");
  }

  if (!payload.authorization) {
    throw new Error("authorization is required");
  }

  const recipient = payload.recipient as `0x${string}`;
  if (!recipient.startsWith("0x") || recipient.length !== 42) {
    throw new Error("recipient must be a valid address");
  }

  const tokenConfig = findTokenConfig(payload.chainId, token);
  if (!tokenConfig) {
    throw new Error("token is not supported on this chain");
  }

  const authorization = normalizeAuthorization(payload.authorization);
  const bundle = normalizeBundle(payload.bundle);

  const validBeforeSeconds = Number(authorization.validBefore);
  if (!Number.isFinite(validBeforeSeconds)) {
    throw new Error("authorization.validBefore must be a numeric timestamp");
  }

  const validAfterSeconds = Number(authorization.validAfter);
  if (!Number.isFinite(validAfterSeconds)) {
    throw new Error("authorization.validAfter must be a numeric timestamp");
  }

  if (validAfterSeconds < 0) {
    throw new Error("authorization.validAfter must be greater than or equal to zero");
  }

  if (validAfterSeconds >= validBeforeSeconds) {
    throw new Error("authorization.validAfter must be less than validBefore");
  }

  const bundleDeadlineSource = payload.bundleDeadline ?? bundle.deadline;
  const bundleDeadlineSeconds = Number(bundleDeadlineSource);
  if (!Number.isFinite(bundleDeadlineSeconds)) {
    throw new Error("bundle.deadline must be a numeric timestamp");
  }

  if (
    !payload.bundleSignature ||
    typeof payload.bundleSignature !== "string" ||
    !payload.bundleSignature.startsWith("0x") ||
    payload.bundleSignature.length !== 132
  ) {
    throw new Error("bundleSignature must be a 65-byte hex string");
  }
  const bundleSignature = payload.bundleSignature as `0x${string}`;

  if (bundle.payer.toLowerCase() !== authorization.from.toLowerCase()) {
    throw new Error("bundle payer must match authorization signer");
  }

  if (bundle.token.toLowerCase() !== token.toLowerCase()) {
    throw new Error("bundle token must match job token");
  }

  if (bundle.recipient.toLowerCase() !== recipient.toLowerCase()) {
    throw new Error("bundle recipient must match recipient field");
  }

  if (payload.paymentId) {
    const overridePaymentId = normalizePaymentId(payload.paymentId);
    if (overridePaymentId !== bundle.paymentId) {
      throw new Error("paymentId must match bundle.paymentId");
    }
  }

  let mainAmount: bigint;
  let feeAmount: bigint;
  try {
    mainAmount = BigInt(payload.mainAmount);
    feeAmount = BigInt(payload.feeAmount);
  } catch (error) {
    throw new Error("mainAmount and feeAmount must be numeric strings");
  }
  if (mainAmount == 0n || feeAmount == 0n) {
    throw new Error("mainAmount and feeAmount must be greater than zero");
  }

  if (BigInt(bundle.mainAmount) !== mainAmount) {
    throw new Error("bundle mainAmount must match provided mainAmount");
  }

  if (BigInt(bundle.feeAmount) !== feeAmount) {
    throw new Error("bundle feeAmount must match provided feeAmount");
  }

  const total = mainAmount + feeAmount;
  if (BigInt(authorization.value) !== total) {
    throw new Error("authorization value must equal mainAmount + feeAmount");
  }

  const limits = getTokenAmountLimits(tokenConfig);

  if (mainAmount < limits.main.min || mainAmount > limits.main.max) {
    throw new Error(
      `mainAmount must be between ${limits.main.minDisplay} and ${limits.main.maxDisplay} ${tokenConfig.symbol}`
    );
  }

  if (feeAmount < limits.fee.min || feeAmount > limits.fee.max) {
    throw new Error(
      `feeAmount must be between ${limits.fee.minDisplay} and ${limits.fee.maxDisplay} ${tokenConfig.symbol}`
    );
  }

  const expiresAt = new Date(validBeforeSeconds * 1000);

  return {
    chainId: payload.chainId,
    token,
    tokenConfig,
    recipient,
    authorization,
    bundle,
    bundleSignature,
    bundleDeadline: bundleDeadlineSeconds,
    mainAmount,
    feeAmount,
    status: payload.status ?? "pending",
    paymentId: bundle.paymentId as `0x${string}`,
    x402PaymentId: payload.x402PaymentId ?? null,
    merchantId: payload.merchantId ?? null,
    validBefore: validBeforeSeconds,
    validAfter: validAfterSeconds,
    expiresAt
  };
}

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

  let normalized: ReturnType<typeof validatePayload>;
  try {
    normalized = validatePayload(jobPayload);
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
