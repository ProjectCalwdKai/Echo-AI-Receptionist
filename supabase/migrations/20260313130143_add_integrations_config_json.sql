alter table public.integrations
  add column if not exists config_json jsonb not null default '{}'::jsonb;