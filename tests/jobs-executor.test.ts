import { describe, expect, it } from "vitest";

import { validatePayload } from "@/app/api/jobs/route";
import {
  buildExecuteArgs,
  normalizeJobExecution,
  validateJobBeforeExecution
} from "@/lib/jobs/executor";
import type { CreateJobRequest, JobRecord } from "@/lib/jobs/types";

const nowSeconds = Math.floor(Date.now() / 1000);
const validAfter = nowSeconds - 120;
const validBefore = nowSeconds + 600;
const bundleDeadline = nowSeconds + 540;

const basePayload: CreateJobRequest = {
  chainId: 137,
  token: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
  authorization: {
    from: "0x1111111111111111111111111111111111111111",
    to: "0x2222222222222222222222222222222222222222",
    value: "1001000",
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    nonce: `0x${"01".repeat(32)}`,
    signature: `0x${"ab".repeat(65)}`
  },
  recipient: "0x3333333333333333333333333333333333333333",
  mainAmount: "1000000",
  feeAmount: "1000",
  bundleDeadline: bundleDeadline.toString(),
  bundleSignature: `0x${"cd".repeat(65)}`,
  bundle: {
    payer: "0x1111111111111111111111111111111111111111",
    token: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    recipient: "0x3333333333333333333333333333333333333333",
    mainAmount: "1000000",
    feeAmount: "1000",
    paymentId: `0x${"12".repeat(32)}`,
    deadline: bundleDeadline.toString()
  }
};

function buildJobRecord(): { job: JobRecord; paymentId: string } {
  const normalized = validatePayload(basePayload);

  const job: JobRecord = {
    id: "job-1",
    chain_id: normalized.chainId,
    token: normalized.token,
    status: "pending",
    payment_id: normalized.paymentId,
    authorization_payload: normalized.authorization,
    bundle: normalized.bundle,
    bundle_signature: normalized.bundleSignature,
    main_amount: normalized.mainAmount.toString(),
    fee_amount: normalized.feeAmount.toString(),
    recipient: normalized.recipient,
    valid_before: normalized.validBefore.toString(),
    expires_at: normalized.expiresAt.toISOString(),
    bundle_deadline: normalized.bundleDeadline.toString(),
    bundle_deadline_at: new Date(normalized.bundleDeadline * 1000).toISOString(),
    created_at: new Date().toISOString()
  };

  return { job, paymentId: normalized.paymentId };
}

describe("job execution helpers", () => {
  it("normalizes job payloads and validates execution window", () => {
    const { job, paymentId } = buildJobRecord();

    const normalizedExecution = normalizeJobExecution(job);
    expect(normalizedExecution.paymentId).toBe(paymentId);
    expect(normalizedExecution.authorization.value).toBe(
      normalizedExecution.mainAmount + normalizedExecution.feeAmount
    );

    expect(() =>
      validateJobBeforeExecution(normalizedExecution, {
        currentTime: Number(normalizedExecution.authorization.validBefore - 10n)
      })
    ).not.toThrow();

    expect(() =>
      validateJobBeforeExecution(normalizedExecution, {
        currentTime: Number(normalizedExecution.authorization.validBefore)
      })
    ).toThrow(/authorization has expired/);

    const args = buildExecuteArgs(normalizedExecution);
    expect(args[0].paymentId).toBe(paymentId);
    expect(args[0].auth[0]).toBe(job.authorization_payload?.from);
  });

  it("rejects zero-amount payloads during validation", () => {
    const invalidPayload: CreateJobRequest = JSON.parse(JSON.stringify(basePayload));
    invalidPayload.mainAmount = "0";
    invalidPayload.bundle.mainAmount = "0";

    expect(() => validatePayload(invalidPayload)).toThrow(
      /mainAmount and feeAmount must be greater than zero/
    );
  });
});
