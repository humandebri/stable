export type AuthorizationRecord = {
  from: `0x${string}`;
  to: `0x${string}`;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: string;
  signature: string;
  v?: number;
  r?: string;
  s?: string;
};

export type BundleRecord = {
  payer: `0x${string}`;
  token: `0x${string}`;
  recipient: `0x${string}`;
  mainAmount: string;
  feeAmount: string;
  paymentId: string;
  deadline: string;
  signature?: string;
};

export type JobRecord = {
  id: string;
  chain_id: number;
  token: `0x${string}`;
  status: string;
  payment_id?: string | null;
  authorization_payload?: AuthorizationRecord | null;
  main?: AuthorizationRecord | null; // legacy
  fee?: AuthorizationRecord | null; // legacy
  bundle?: BundleRecord | null;
  bundle_signature?: string | null;
  x402_payment_id?: string | null;
  created_at: string;
  valid_before?: string | null;
  expires_at?: string | null;
  taken_at?: string | null;
  taken_by?: string | null;
  executed_tx_hash?: string | null;
  executed_at?: string | null;
  fail_reason?: string | null;
  recipient?: `0x${string}` | null;
  bundle_deadline?: string | null;
  bundle_deadline_at?: string | null;
  main_amount?: string | null;
  fee_amount?: string | null;
};

export type CreateJobRequest = {
  chainId: number;
  token: `0x${string}`;
  status?: string;
  authorization: AuthorizationRecord;
  recipient: `0x${string}`;
  mainAmount: string;
  feeAmount: string;
  x402PaymentId?: string | null;
  paymentId?: string | null;
  merchantId?: string | null;
  bundle: BundleRecord;
  bundleSignature: string;
  bundleDeadline?: string;
};

export type JobResponse = {
  job: JobRecord;
};

export type JobsResponse = {
  jobs: JobRecord[];
};

export type JobReservationStatus = "pending" | "completed" | "failed" | "expired";

export type JobReservationRecord = {
  id: string;
  payment_id: string;
  authorization_nonce: string;
  chain_id: number;
  token: `0x${string}`;
  wallet_address: `0x${string}`;
  merchant_id: string | null;
  status: JobReservationStatus;
  valid_after: string;
  valid_before: string;
  bundle_deadline: string;
  expires_at: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};
