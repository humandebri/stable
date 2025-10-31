alter table public.jobs
  add column if not exists valid_before bigint,
  add column if not exists expires_at timestamptz,
  add column if not exists taken_at timestamptz,
  add column if not exists taken_by text,
  add column if not exists fail_reason text;

comment on column public.jobs.valid_before is 'Unix timestamp (seconds) when authorization expires.';
comment on column public.jobs.expires_at is 'Timestamp derived from valid_before for easier queries.';
comment on column public.jobs.taken_at is 'When a facilitator started processing the job.';
comment on column public.jobs.taken_by is 'Facilitator identifier (address) that started processing.';
comment on column public.jobs.fail_reason is 'Optional reason when execution failed.';

create index if not exists jobs_expires_at_idx on public.jobs(expires_at);
