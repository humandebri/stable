import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AuthorizationRecord,
  CreateJobRequest,
  JobRecord
} from "@/lib/jobs/types";

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

function validatePayload(payload: CreateJobPayload) {
  if (typeof payload.chainId !== "number" || Number.isNaN(payload.chainId)) {
    throw new Error("chainId must be a number");
  }

  if (!payload.token) {
    throw new Error("token is required");
  }

  if (!payload.main || !payload.fee) {
    throw new Error("main and fee authorizations are required");
  }

  const main = normalizeAuthorization(payload.main);
  const fee = normalizeAuthorization(payload.fee);

  const validBeforeMs = Number(main.validBefore);

  if (!Number.isFinite(validBeforeMs)) {
    throw new Error("main.validBefore must be a numeric timestamp");
  }

  const expiresAt = new Date(validBeforeMs * 1000);

  return {
    chainId: payload.chainId,
    token: payload.token,
    main,
    fee,
    status: payload.status ?? "pending",
    x402PaymentId: payload.x402PaymentId ?? null,
    validBefore: validBeforeMs,
    expiresAt
  } as const;
}

export async function POST(request: Request) {
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

  try {
    const supabase = createSupabaseServerClient();
    const { error, data } = await supabase
      .from("jobs")
      .insert({
        chain_id: normalized.chainId,
        token: normalized.token,
        main: normalized.main,
        fee: normalized.fee,
        status: normalized.status,
        x402_payment_id: normalized.x402PaymentId,
        valid_before: normalized.validBefore,
        expires_at: normalized.expiresAt.toISOString()
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
