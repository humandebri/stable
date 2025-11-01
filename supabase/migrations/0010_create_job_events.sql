create table if not exists public.job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id),
  payment_id text,
  event_type text not null,
  status_code integer,
  message text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

comment on table public.job_events is 'Stores ingestion, validation, and execution events for observability.';
comment on column public.job_events.event_type is 'request_received | validation_failed | reservation_conflict | job_saved | job_execution_update | cleanup_action | api_error';
comment on column public.job_events.metadata is 'Optional structured payload for additional context.';

create index if not exists job_events_payment_id_idx
  on public.job_events (payment_id);

create index if not exists job_events_event_type_created_idx
  on public.job_events (event_type, created_at desc);
