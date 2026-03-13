// Supabase Edge Function: tools
// Multi-tenant tool router for Vapi function calls.
// TODO: implement lead.create, sms.sendFollowup, calendar.checkAvailability, calendar.createBooking (google/m365)

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const payload = await req.json().catch(() => ({}));
  return new Response(JSON.stringify({ ok: false, error: 'NOT_IMPLEMENTED', payload }), {
    headers: { 'content-type': 'application/json' },
    status: 501,
  });
});
