-- Echo AI Receptionist (UK-first) - initial multi-tenant schema

-- Extensions
create extension if not exists "pgcrypto";

-- =====================
-- Core tenancy
-- =====================
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_key text not null default 'general',
  timezone text not null default 'Europe/London',
  currency text not null default 'GBP',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  address text,
  hours_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_users (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

-- Helper: check membership
create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists(
    select 1 from public.tenant_users tu
    where tu.tenant_id = p_tenant_id and tu.user_id = auth.uid()
  );
$$;

-- =====================
-- Vapi mappings
-- =====================
create table if not exists public.vapi_assistants (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  vapi_assistant_id text not null unique,
  name text,
  last_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vapi_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  tenant_location_id uuid not null references public.tenant_locations(id) on delete cascade,
  vapi_phone_number_id text not null unique,
  e164 text not null,
  forwarding_note text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

-- =====================
-- Integrations (secrets stored separately, service-role only)
-- =====================
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  status text not null default 'connected',
  scopes text[],
  connected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

create table if not exists public.integration_secrets (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  encrypted_json jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, provider)
);

-- =====================
-- Operations
-- =====================
create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vapi_call_id text not null unique,
  vapi_assistant_id text,
  vapi_phone_number_id text,
  started_at timestamptz,
  ended_at timestamptz,
  duration_sec integer,
  intent text,
  outcome text,
  transcript jsonb,
  summary text,
  recording_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid references public.tenant_locations(id) on delete set null,
  name text,
  phone text,
  email text,
  reason text,
  urgency text,
  preferred_time text,
  details_json jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  location_id uuid references public.tenant_locations(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  calendar_provider text,
  calendar_id text,
  calendar_event_id text,
  customer_json jsonb not null default '{}'::jsonb,
  status text not null default 'confirmed',
  created_at timestamptz not null default now()
);

create table if not exists public.usage_daily (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  date date not null,
  call_count integer not null default 0,
  minutes numeric(10,2) not null default 0,
  vapi_cost_reported numeric(10,4),
  vapi_cost_estimated numeric(10,4),
  created_at timestamptz not null default now(),
  primary key (tenant_id, date)
);

-- =====================
-- RLS
-- =====================
alter table public.tenants enable row level security;
alter table public.tenant_locations enable row level security;
alter table public.tenant_users enable row level security;
alter table public.vapi_assistants enable row level security;
alter table public.vapi_phone_numbers enable row level security;
alter table public.integrations enable row level security;
alter table public.integration_secrets enable row level security;
alter table public.calls enable row level security;
alter table public.leads enable row level security;
alter table public.bookings enable row level security;
alter table public.usage_daily enable row level security;

-- Tenants: members can read; only service role should create tenants initially (we'll add RPC later)
create policy "tenants_select_member" on public.tenants
for select using (public.is_tenant_member(id));

-- Locations
create policy "locations_select_member" on public.tenant_locations
for select using (public.is_tenant_member(tenant_id));
create policy "locations_write_admin" on public.tenant_locations
for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));

-- Tenant users
create policy "tenant_users_select_member" on public.tenant_users
for select using (public.is_tenant_member(tenant_id));

-- Vapi mappings
create policy "vapi_assistants_select_member" on public.vapi_assistants
for select using (public.is_tenant_member(tenant_id));
create policy "vapi_phone_numbers_select_member" on public.vapi_phone_numbers
for select using (
  exists (
    select 1 from public.tenant_locations tl
    where tl.id = tenant_location_id and public.is_tenant_member(tl.tenant_id)
  )
);

-- Integrations (non-secret)
create policy "integrations_select_member" on public.integrations
for select using (public.is_tenant_member(tenant_id));
create policy "integrations_write_member" on public.integrations
for all using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id));

-- Secrets: deny by default to anon/auth users (service role only)
create policy "integration_secrets_deny" on public.integration_secrets
for all using (false) with check (false);

-- Calls/leads/bookings/usage
create policy "calls_select_member" on public.calls
for select using (public.is_tenant_member(tenant_id));
create policy "leads_select_member" on public.leads
for select using (public.is_tenant_member(tenant_id));
create policy "bookings_select_member" on public.bookings
for select using (public.is_tenant_member(tenant_id));
create policy "usage_select_member" on public.usage_daily
for select using (public.is_tenant_member(tenant_id));

-- Writes for ops tables will mostly be via Edge Functions (service role) in v1,
-- so we don't open broad write policies yet.
