alter table public.bookings
  add column if not exists customer_phone text,
  add column if not exists customer_name text,
  add column if not exists customer_email text;

create index if not exists bookings_tenant_customer_phone_idx
  on public.bookings (tenant_id, customer_phone);
