create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  token text not null,
  status text not null default 'pending',
  main jsonb not null,
  fee jsonb not null,
  x402_payment_id text,
  created_at timestamptz not null default now(),
  executed_tx_hash text,
  executed_at timestamptz
);

comment on table public.jobs is 'Stores user-signed EIP-3009 authorizations (main + fee) for facilitators to execute later.';
comment on column public.jobs.chain_id is 'EVM chain ID (e.g., 137 for Polygon).';
comment on column public.jobs.token is 'Token contract address to execute the authorization against.';
comment on column public.jobs.status is 'pending | processing | executed | expired | failed | cancelled';

create index if not exists jobs_status_created_at_idx
  on public.jobs (status, created_at desc);

create index if not exists jobs_chain_token_idx
  on public.jobs (chain_id, token);
