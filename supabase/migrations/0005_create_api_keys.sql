create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  created_by text,
  last_used_at timestamptz,
  revoked_at timestamptz
);

comment on table public.api_keys is 'Stores hashed API keys that can call internal Paylancer APIs.';
comment on column public.api_keys.name is 'Human readable label for the API key.';
comment on column public.api_keys.key_hash is 'SHA-256 hash of the API key (plk_ prefix).';
comment on column public.api_keys.created_by is 'Optional identifier (e.g., wallet or email) of who created the key.';
comment on column public.api_keys.last_used_at is 'Timestamp of the last request authenticated with this key.';
comment on column public.api_keys.revoked_at is 'When set, the key is treated as inactive.';

create unique index if not exists api_keys_key_hash_idx on public.api_keys(key_hash);
