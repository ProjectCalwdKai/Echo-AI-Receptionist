create table if not exists public.oauth_states (
  state text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  provider text not null,
  created_at timestamptz not null default now()
);

create index if not exists oauth_states_tenant_idx on public.oauth_states (tenant_id);

alter table public.oauth_states enable row level security;

-- deny direct access (service role only)
create policy "oauth_states_deny" on public.oauth_states
for all using (false) with check (false);
