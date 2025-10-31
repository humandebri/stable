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

export type JobRecord = {
  id: string;
  chain_id: number;
  token: `0x${string}`;
  status: string;
  main: AuthorizationRecord;
  fee: AuthorizationRecord;
  x402_payment_id?: string | null;
  created_at: string;
  valid_before?: string | null;
  expires_at?: string | null;
  taken_at?: string | null;
  taken_by?: string | null;
  executed_tx_hash?: string | null;
  executed_at?: string | null;
  fail_reason?: string | null;
};

export type CreateJobRequest = {
  chainId: number;
  token: `0x${string}`;
  status?: string;
  main: AuthorizationRecord;
  fee: AuthorizationRecord;
  x402PaymentId?: string | null;
};

export type JobResponse = {
  job: JobRecord;
};

export type JobsResponse = {
  jobs: JobRecord[];
};
