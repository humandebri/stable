alter table public.jobs
  add column if not exists payment_id text;

comment on column public.jobs.payment_id is 'Normalized paymentId used for reservation and execution.';

create unique index if not exists jobs_payment_id_idx
  on public.jobs (payment_id)
  where payment_id is not null;
