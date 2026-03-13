# Echo AI Receptionist

Multi-tenant AI receptionist platform (UK-first) built on:
- **Vapi** (voice agent)
- **Supabase** (Postgres + Auth + RLS + Storage + Edge Functions)
- **Next.js (Vercel)** (client portal + onboarding)

## Repo structure
- `apps/web` — Next.js dashboard (deploy to Vercel)
- `supabase/` — migrations, local dev, Edge Functions

## Local dev
> This repo uses pnpm via Corepack.

```bash
corepack prepare pnpm@9.15.5 --activate
pnpm -C apps/web dev
```

## Next steps
- Add Supabase schema + RLS policies
- Implement Edge Functions:
  - `vapi/webhook`
  - `tools`
  - `oauth/*`
