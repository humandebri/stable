alter table public.job_reservations
  add column if not exists job_id uuid references public.jobs(id);

comment on column public.job_reservations.job_id is 'ID of the finalized job using this reservation.';

create index if not exists job_reservations_job_id_idx
  on public.job_reservations (job_id);
