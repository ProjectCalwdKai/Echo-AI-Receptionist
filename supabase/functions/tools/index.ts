// Supabase Edge Function: tools
// Multi-tenant tool router for Vapi function calls.
// TODO: implement lead.create, sms.sendFollowup, calendar.checkAvailability, calendar.createBooking (google/m365)

function unauthorized() {
  return new Response('Unauthorized', { status: 401 });
}

function checkAuth(req: Request): boolean {
  const expected = Deno.env.get('VAPI_SERVER_BEARER_TOKEN');
  if (!expected) return true;

  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return !!m && m[1] === expected;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  if (!checkAuth(req)) return unauthorized();

  const payload = await req.json().catch(() => ({}));
  return new Response(JSON.stringify({ ok: false, error: 'NOT_IMPLEMENTED', payload }), {
    headers: { 'content-type': 'application/json' },
    status: 501,
  });
});
