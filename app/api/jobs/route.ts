import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AuthorizationRecord,
  BundleRecord,
  CreateJobRequest
} from "@/lib/jobs/types";
import { assertInternalRequest } from "@/lib/api/auth";

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

  return {
    payer: bundle.payer,
    token: bundle.token,
    recipient: bundle.recipient,
    mainAmount: toStringValue(bundle.mainAmount),
    feeAmount: toStringValue(bundle.feeAmount),
    paymentId: bundle.paymentId,
    deadline: toStringValue(bundle.deadline)
  };
}

function validatePayload(payload: CreateJobPayload) {
  if (typeof payload.chainId !== "number" || Number.isNaN(payload.chainId)) {
    throw new Error("chainId must be a number");
  }

  if (!payload.token) {
    throw new Error("token is required");
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

  const authorization = normalizeAuthorization(payload.authorization);
  const bundle = normalizeBundle(payload.bundle);

  const validBeforeSeconds = Number(authorization.validBefore);
  if (!Number.isFinite(validBeforeSeconds)) {
    throw new Error("main.validBefore must be a numeric timestamp");
  }

  const bundleDeadlineSource = payload.bundleDeadline ?? bundle.deadline;
  const bundleDeadlineSeconds = Number(bundleDeadlineSource);
  if (!Number.isFinite(bundleDeadlineSeconds)) {
    throw new Error("bundle.deadline must be a numeric timestamp");
  }

  if (!payload.bundleSignature || !payload.bundleSignature.startsWith("0x")) {
    throw new Error("bundleSignature must be a 0x-prefixed hex string");
  }

  if (bundle.payer.toLowerCase() !== authorization.from.toLowerCase()) {
    throw new Error("bundle payer must match authorization signer");
  }

  if (bundle.token.toLowerCase() !== payload.token.toLowerCase()) {
    throw new Error("bundle token must match job token");
  }

  if (bundle.recipient.toLowerCase() !== recipient.toLowerCase()) {
    throw new Error("bundle recipient must match recipient field");
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

  const expiresAt = new Date(validBeforeSeconds * 1000);

  return {
    chainId: payload.chainId,
    token: payload.token,
    recipient,
    authorization,
    bundle,
    bundleSignature: payload.bundleSignature,
    bundleDeadline: bundleDeadlineSeconds,
    mainAmount: mainAmount.toString(),
    feeAmount: feeAmount.toString(),
    status: payload.status ?? "pending",
    x402PaymentId: payload.x402PaymentId ?? bundle.paymentId ?? null,
    validBefore: validBeforeSeconds,
    expiresAt
  } as const;
}

export async function POST(request: Request) {
  try {
    assertInternalRequest(request);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let jobPayload: CreateJobPayload;

  try {
    jobPayload = await request.json();
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  let normalized: ReturnType<typeof validatePayload>;
  try {
    normalized = validatePayload(jobPayload);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (normalized.validBefore <= nowSeconds) {
    return NextResponse.json(
      { error: "Authorization has already expired" },
      { status: 400 }
    );
  }

  try {
    const supabase = createSupabaseServerClient();
    const { error, data } = await supabase
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
        x402_payment_id: normalized.x402PaymentId,
        valid_before: normalized.validBefore,
        expires_at: normalized.expiresAt.toISOString(),
        bundle_deadline: normalized.bundleDeadline,
        bundle_deadline_at: new Date(
          normalized.bundleDeadline * 1000
        ).toISOString(),
        main_amount: normalized.mainAmount,
        fee_amount: normalized.feeAmount
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ job: data }, { status: 201 });
  } catch (error) {
    console.error("Failed to insert job", error);
    return NextResponse.json(
      { error: "Failed to save job" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    assertInternalRequest(request);
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
