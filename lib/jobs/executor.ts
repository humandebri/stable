import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient
} from "viem";

import { erc3009ExecutorAbi } from "@/lib/abi/erc3009Executor";
import type { AuthorizationRecord, JobRecord } from "@/lib/jobs/types";

const ZERO32 = `0x${"0".repeat(64)}` as const satisfies Hex;

type NormalizedAuthorization = {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
  v: number;
  r: Hex;
  s: Hex;
};

type NormalizedBundle = {
  paymentId: Hex;
  deadline: bigint;
  signature: Hex;
};

export type NormalizedJobExecution = {
  paymentId: Hex;
  token: Address;
  recipient: Address;
  authorization: NormalizedAuthorization;
  mainAmount: bigint;
  feeAmount: bigint;
  deadline: bigint;
  bundleSignature: Hex;
};

function assertAddress(value: string | null | undefined, field: string): asserts value is Address {
  if (!value || !value.startsWith("0x") || value.length !== 42) {
    throw new Error(`${field} must be a checksum address`);
  }
}

function toBigInt(value: string | number | bigint | null | undefined, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") {
    if (value.trim().length === 0) {
      throw new Error(`${field} is empty`);
    }
    return BigInt(value);
  }
  throw new Error(`${field} is missing`);
}

function toHex(value: string | null | undefined, field: string, expectedLength?: number): Hex {
  if (!value) {
    throw new Error(`${field} is missing`);
  }
  if (!value.startsWith("0x")) {
    throw new Error(`${field} must be 0x-prefixed`);
  }
  if (expectedLength && value.length !== expectedLength) {
    throw new Error(`${field} must be ${expectedLength - 2} bytes`);
  }
  return value as Hex;
}

function normalizeAuthorizationRecord(auth: AuthorizationRecord | null | undefined): NormalizedAuthorization {
  if (!auth) {
    throw new Error("authorization payload is not set");
  }

  assertAddress(auth.from, "authorization.from");
  assertAddress(auth.to, "authorization.to");

  const value = toBigInt(auth.value, "authorization.value");
  const validAfter = toBigInt(auth.validAfter, "authorization.validAfter");
  const validBefore = toBigInt(auth.validBefore, "authorization.validBefore");
  const nonce = toHex(auth.nonce, "authorization.nonce", 66);

  let v: number;
  if (typeof auth.v === "number") {
    v = auth.v;
  } else if (auth.signature) {
    const stripped = auth.signature.slice(2);
    if (stripped.length !== 130) {
      throw new Error("authorization.signature has invalid length");
    }
    const rawV = stripped.slice(128, 130);
    v = Number.parseInt(rawV, 16);
    if (v < 27) v += 27;
  } else {
    throw new Error("authorization.v is missing");
  }

  let r: Hex | undefined;
  let s: Hex | undefined;
  if (auth.r && auth.s) {
    r = toHex(auth.r, "authorization.r", 66);
    s = toHex(auth.s, "authorization.s", 66);
  } else if (auth.signature) {
    const stripped = auth.signature.slice(2);
    if (stripped.length !== 130) {
      throw new Error("authorization.signature has invalid length");
    }
    r = (`0x${stripped.slice(0, 64)}`) as Hex;
    s = (`0x${stripped.slice(64, 128)}`) as Hex;
  }

  if (!r || !r.startsWith("0x") || r.length !== 66) {
    throw new Error("authorization.r is invalid");
  }
  if (!s || !s.startsWith("0x") || s.length !== 66) {
    throw new Error("authorization.s is invalid");
  }

  return {
    from: auth.from,
    to: auth.to,
    value,
    validAfter,
    validBefore,
    nonce,
    v,
    r: r as Hex,
    s: s as Hex
  };
}

function normalizeBundle(job: JobRecord): NormalizedBundle {
  const paymentId = toHex(
    job.payment_id ?? job.x402_payment_id ?? job.bundle?.paymentId ?? ZERO32,
    "paymentId",
    66
  );

  const rawDeadline = job.bundle_deadline ?? job.bundle?.deadline;
  const deadline = toBigInt(rawDeadline, "bundle.deadline");

  const signatureSource = job.bundle_signature ?? job.bundle?.signature;
  const signature = toHex(signatureSource, "bundleSignature", 132);

  return {
    paymentId,
    deadline,
    signature
  };
}

export function normalizeJobExecution(job: JobRecord): NormalizedJobExecution {
  const bundle = normalizeBundle(job);

  assertAddress(job.token, "job.token");
  const recipientSource = job.recipient ?? job.bundle?.recipient ?? job.main?.to ?? null;
  assertAddress(recipientSource, "recipient");
  const recipient = recipientSource as Address;

  const authorization = normalizeAuthorizationRecord(job.authorization_payload ?? job.main ?? undefined);

  const mainAmountSource = job.main_amount ?? job.bundle?.mainAmount;
  const feeAmountSource = job.fee_amount ?? job.bundle?.feeAmount;

  const mainAmount = toBigInt(mainAmountSource, "mainAmount");
  const feeAmount = toBigInt(feeAmountSource, "feeAmount");

  if (authorization.value !== mainAmount + feeAmount) {
    throw new Error("authorization value does not equal main+fee amounts");
  }

  return {
    paymentId: bundle.paymentId,
    token: job.token as Address,
    recipient,
    authorization,
    mainAmount,
    feeAmount,
    deadline: bundle.deadline,
    bundleSignature: bundle.signature
  };
}

export type ExecutionValidationOptions = {
  currentTime?: number;
};

export function validateJobBeforeExecution(
  normalized: NormalizedJobExecution,
  options: ExecutionValidationOptions = {}
) {
  const now = BigInt(options.currentTime ?? Math.floor(Date.now() / 1000));

  if (now >= normalized.authorization.validBefore) {
    throw new Error("authorization has expired");
  }
  if (now >= normalized.deadline) {
    throw new Error("bundle deadline has passed");
  }
  if (normalized.authorization.validAfter > now) {
    throw new Error("authorization is not yet valid");
  }
  if (normalized.mainAmount === 0n) {
    throw new Error("main amount must be greater than zero");
  }
  if (normalized.feeAmount === 0n) {
    throw new Error("fee amount must be greater than zero");
  }
}

export type ExecuteArgs = [
  {
    paymentId: Hex;
    token: Address;
    recipient: Address;
    auth: [
      Address,
      Address,
      bigint,
      bigint,
      bigint,
      Hex,
      number,
      Hex,
      Hex
    ];
    mainAmount: bigint;
    feeAmount: bigint;
    deadline: bigint;
    bundleSig: Hex;
  }
];

export function buildExecuteArgs(normalized: NormalizedJobExecution): ExecuteArgs {
  return [
    {
      paymentId: normalized.paymentId,
      token: normalized.token,
      recipient: normalized.recipient,
      auth: [
        normalized.authorization.from,
        normalized.authorization.to,
        normalized.authorization.value,
        normalized.authorization.validAfter,
        normalized.authorization.validBefore,
        normalized.authorization.nonce,
        normalized.authorization.v,
        normalized.authorization.r,
        normalized.authorization.s
      ],
      mainAmount: normalized.mainAmount,
      feeAmount: normalized.feeAmount,
      deadline: normalized.deadline,
      bundleSig: normalized.bundleSignature
    }
  ];
}

export type SimulateJobExecutionParams = {
  publicClient: PublicClient;
  executor: Address;
  job: JobRecord;
  account: Address;
};

export async function simulateJobExecution({
  publicClient,
  executor,
  job,
  account
}: SimulateJobExecutionParams) {
  const normalized = normalizeJobExecution(job);
  validateJobBeforeExecution(normalized);

  const args = buildExecuteArgs(normalized);

  return publicClient.simulateContract({
    account,
    address: executor,
    abi: erc3009ExecutorAbi,
    functionName: "executeAuthorizedTransfer",
    args
  });
}

export type ExecuteJobParams = {
  walletClient: WalletClient;
  publicClient?: PublicClient;
  executor: Address;
  job: JobRecord;
};

export async function executeJob({
  walletClient,
  publicClient,
  executor,
  job
}: ExecuteJobParams) {
  const account = walletClient.account;
  if (!account) {
    throw new Error("Wallet client is not connected");
  }

  const normalized = normalizeJobExecution(job);
  validateJobBeforeExecution(normalized);
  const args = buildExecuteArgs(normalized);

  if (publicClient) {
    await publicClient.simulateContract({
      account: account.address,
      address: executor,
      abi: erc3009ExecutorAbi,
      functionName: "executeAuthorizedTransfer",
      args
    });
  }

  return walletClient.writeContract({
    account,
    address: executor,
    abi: erc3009ExecutorAbi,
    functionName: "executeAuthorizedTransfer",
    args,
    chain: walletClient.chain
  });
}

export type ExecuteJobWithLoggingParams = ExecuteJobParams & {
  logger?: (message: string, context?: Record<string, unknown>) => void;
};

/**
 * executeJobWithLogging は normalize → validate → simulate → send を順番に実行し、
 * 途中経過を任意の logger へ流し込む補助関数です。
 */
export async function executeJobWithLogging(params: ExecuteJobWithLoggingParams) {
  const { logger, ...rest } = params;
  const { walletClient, executor, job, publicClient } = rest;

  const account = walletClient.account;
  if (!account) {
    throw new Error("Wallet client is not connected");
  }

  const log = (message: string, context?: Record<string, unknown>) => {
    if (logger) {
      logger(message, context);
    }
  };

  log("normalizing job execution payload", { jobId: job.id });
  const normalized = normalizeJobExecution(job);

  log("validating execution window", {
    paymentId: normalized.paymentId,
    mainAmount: normalized.mainAmount.toString(),
    feeAmount: normalized.feeAmount.toString()
  });
  validateJobBeforeExecution(normalized);

  const args = buildExecuteArgs(normalized);

  if (publicClient) {
    log("simulating executeAuthorizedTransfer", { executor });
    await publicClient.simulateContract({
      account: account.address,
      address: executor,
      abi: erc3009ExecutorAbi,
      functionName: "executeAuthorizedTransfer",
      args
    });
  }

  log("sending executeAuthorizedTransfer transaction", { executor });
  return walletClient.writeContract({
    account,
    address: executor,
    abi: erc3009ExecutorAbi,
    functionName: "executeAuthorizedTransfer",
    args,
    chain: walletClient.chain
  });
}
