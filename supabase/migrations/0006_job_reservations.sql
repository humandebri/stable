create table if not exists public.job_reservations (
  id uuid primary key default gen_random_uuid(),
  payment_id text not null unique,
  authorization_nonce text not null unique,
  created_at timestamptz not null default now()
);

comment on table public.job_reservations is 'Temporary reservation of paymentId and authorization nonce to prevent duplicates.';
comment on column public.job_reservations.payment_id is 'EIP-3009 paymentId (bundle.paymentId).';
comment on column public.job_reservations.authorization_nonce is 'Nonce from transferWithAuthorization. Stored as text for simplicity.';

create index if not exists job_reservations_created_at_idx on public.job_reservations(created_at);
