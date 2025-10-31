drop table if exists public.job_reservations;

create table public.job_reservations (
  id uuid primary key default gen_random_uuid(),
  payment_id text not null unique,
  authorization_nonce text not null unique,
  chain_id integer not null,
  token text not null,
  wallet_address text not null,
  merchant_id text,
  status text not null default 'pending',
  valid_after bigint not null,
  valid_before bigint not null,
  bundle_deadline bigint not null,
  expires_at timestamptz not null,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_reservations_status_check check (
    status in ('pending', 'completed', 'failed', 'expired')
  )
);

comment on table public.job_reservations is 'Temporary reservation of paymentId and authorization nonce to prevent duplicates.';
comment on column public.job_reservations.payment_id is 'EIP-3009 paymentId (bundle.paymentId).';
comment on column public.job_reservations.authorization_nonce is 'transferWithAuthorization nonce stored as text.';
comment on column public.job_reservations.wallet_address is 'Requester wallet address (payer).';
comment on column public.job_reservations.merchant_id is 'Optional merchant identifier or address.';
comment on column public.job_reservations.status is 'pending | completed | failed | expired.';
comment on column public.job_reservations.valid_after is 'Unix seconds when the authorization becomes valid.';
comment on column public.job_reservations.valid_before is 'Unix seconds when the authorization expires.';
comment on column public.job_reservations.bundle_deadline is 'Unix seconds when the bundle signature expires.';
comment on column public.job_reservations.expires_at is 'Timestamp when the reservation should be considered stale.';

create index if not exists job_reservations_expires_at_idx
  on public.job_reservations (expires_at);
