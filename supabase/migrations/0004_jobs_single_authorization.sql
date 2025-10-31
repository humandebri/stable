alter table public.jobs
  add column if not exists authorization_payload jsonb,
  add column if not exists main_amount text,
  add column if not exists fee_amount text;

comment on column public.jobs.authorization_payload is 'Combined transferWithAuthorization (main + fee) provided by the payer.';
comment on column public.jobs.main_amount is 'Main transfer amount (string, for display / calculation).';
comment on column public.jobs.fee_amount is 'Facilitator fee amount (string, for display / calculation).';
