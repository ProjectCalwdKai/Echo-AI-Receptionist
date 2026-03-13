alter table public.bookings
  add column if not exists service_name text,
  add column if not exists notes text;

create index if not exists bookings_tenant_service_idx
  on public.bookings (tenant_id, service_name);
