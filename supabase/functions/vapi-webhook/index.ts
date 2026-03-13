// Supabase Edge Function: vapi-webhook
// Receives Vapi call lifecycle events and stores them in Postgres.
// TODO: verify webhook signature, map assistant/number -> tenant, upsert calls + usage rollups.

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const body = await req.json().catch(() => null);
  return new Response(JSON.stringify({ ok: true, received: body ? true : false }), {
    headers: { 'content-type': 'application/json' },
  });
});
