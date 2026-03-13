-- Store inbound tool calls for debugging/audit
create table if not exists public.tool_calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vapi_call_id text,
  assistant_id text,
  tool_name text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.tool_calls enable row level security;

create policy "tool_calls_select_member" on public.tool_calls
for select using (public.is_tenant_member(tenant_id));
