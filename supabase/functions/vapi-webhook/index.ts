// Supabase Edge Function: vapi-webhook
// Receives Vapi call lifecycle events and stores them in Postgres.
// TODO: verify webhook signature, map assistant/number -> tenant, upsert calls + usage rollups.

function unauthorized() {
  return new Response('Unauthorized', { status: 401 });
}

function checkAuth(req: Request): boolean {
  // Vapi recommends using Custom Credentials + credentialId.
  // We expect: Authorization: Bearer <token>
  const expected = Deno.env.get('VAPI_SERVER_BEARER_TOKEN');
  if (!expected) return true; // allow if not configured yet

  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return !!m && m[1] === expected;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!checkAuth(req)) return unauthorized();

  const body = await req.json().catch(() => null);

  // TODO: verify payload shape, map assistant/number -> tenant, upsert calls + usage rollups.
  return new Response(JSON.stringify({ ok: true, received: body ? true : false }), {
    headers: { 'content-type': 'application/json' },
  });
});
