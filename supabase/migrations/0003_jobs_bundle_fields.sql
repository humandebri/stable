alter table public.jobs
  add column if not exists recipient text,
  add column if not exists bundle jsonb,
  add column if not exists bundle_signature text,
  add column if not exists bundle_deadline bigint,
  add column if not exists bundle_deadline_at timestamptz;

comment on column public.jobs.recipient is 'Final recipient address confirmed via EIP-712 bundle signature.';
comment on column public.jobs.bundle is 'EIP-712 bundle payload (payer, token, recipient, amounts, paymentId, deadline).';
comment on column public.jobs.bundle_signature is 'User signed EIP-712 bundle signature.';
comment on column public.jobs.bundle_deadline is 'Unix timestamp (seconds) for bundle validity.';
comment on column public.jobs.bundle_deadline_at is 'Timestamp representation of bundle_deadline.';

create index if not exists jobs_recipient_idx on public.jobs(recipient);
