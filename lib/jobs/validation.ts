import { normalizePaymentId } from "@/lib/eip3009";
import { findTokenConfig, getTokenAmountLimits } from "@/lib/tokens";
import type { SupportedTokenConfig } from "@/lib/tokens";
import type {
  AuthorizationRecord,
  BundleRecord,
  CreateJobRequest
} from "@/lib/jobs/types";

export type AuthorizationPayload = {
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

export type NormalizedJobPayload = {
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

export function validateJobCreatePayload(payload: CreateJobRequest): NormalizedJobPayload {
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

  const authorization = normalizeAuthorization(payload.authorization as AuthorizationPayload);
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
  if (mainAmount === 0n || feeAmount === 0n) {
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
