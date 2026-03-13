// Supabase Edge Function: vapi-webhook
// Receives Vapi call lifecycle events and stores them in Postgres.
// Auth: Vapi Custom Credentials (Authorization: Bearer <token>).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = "https://pmfvfggpaphwkdtvsndk.supabase.co";

function unauthorized() {
  return new Response('Unauthorized', { status: 401 });
}

function checkAuth(req: Request): boolean {
  const expected = Deno.env.get('VAPI_SERVER_BEARER_TOKEN');
  if (!expected) return true; // allow if not configured yet

  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return !!m && m[1] === expected;
}

function getServiceClient() {
  const key = Deno.env.get('SERVICE_ROLE_KEY');
  if (!key) throw new Error('SERVICE_ROLE_KEY not set');
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false },
    global: { headers: { 'X-Client-Info': 'echo-ai-receptionist/vapi-webhook' } },
  });
}

function pickFirst<T>(...vals: Array<T | undefined | null>): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null) return v as T;
  return undefined;
}

function extractIds(payload: any) {
  // Vapi payloads can vary by event type; we try a few common shapes.
  const vapiCallId = pickFirst<string>(
    payload?.call?.id,
    payload?.call?.callId,
    payload?.message?.call?.id,
    payload?.data?.call?.id,
    payload?.callId,
    payload?.id,
  );

  const vapiAssistantId = pickFirst<string>(
    payload?.assistant?.id,
    payload?.message?.assistant?.id,
    payload?.assistantId,
    payload?.call?.assistantId,
    payload?.message?.call?.assistantId,
    payload?.data?.assistantId,
  );

  const vapiPhoneNumberId = pickFirst<string>(
    payload?.phoneNumber?.id,
    payload?.message?.phoneNumber?.id,
    payload?.phoneNumberId,
    payload?.call?.phoneNumberId,
    payload?.message?.call?.phoneNumberId,
    payload?.data?.phoneNumberId,
  );

  return { vapiCallId, vapiAssistantId, vapiPhoneNumberId };
}

async function getOrCreateTenantForAssistant(supabase: ReturnType<typeof getServiceClient>, vapiAssistantId: string) {
  // 1) Try existing mapping
  const { data: existing, error: existingErr } = await supabase
    .from('vapi_assistants')
    .select('tenant_id')
    .eq('vapi_assistant_id', vapiAssistantId)
    .maybeSingle();

  if (existingErr) throw existingErr;
  if (existing?.tenant_id) return existing.tenant_id as string;

  // 2) Auto-provision a tenant for new assistant IDs (good for early testing)
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .insert({ name: `Tenant for ${vapiAssistantId}`, template_key: 'general' })
    .select('id')
    .single();
  if (tenantErr) throw tenantErr;

  const tenantId = tenant.id as string;

  const { error: mapErr } = await supabase
    .from('vapi_assistants')
    .insert({ tenant_id: tenantId, vapi_assistant_id: vapiAssistantId, name: `Assistant ${vapiAssistantId}` });
  if (mapErr) throw mapErr;

  return tenantId;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    if (!checkAuth(req)) return unauthorized();

    const payload = await req.json();
    const { vapiCallId, vapiAssistantId, vapiPhoneNumberId } = extractIds(payload);

    if (!vapiCallId) {
      return new Response(JSON.stringify({ ok: false, error: 'MISSING_CALL_ID' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const supabase = getServiceClient();

    if (!vapiAssistantId) {
      return new Response(JSON.stringify({ ok: false, error: 'MISSING_ASSISTANT_ID' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      });
    }

    const tenantId = await getOrCreateTenantForAssistant(supabase, vapiAssistantId);

    // Upsert call with raw payload stored in jsonb (note: overwritten per event).
    const now = new Date().toISOString();
    const { error: upsertErr } = await supabase
      .from('calls')
      .upsert({
        tenant_id: tenantId,
        vapi_call_id: vapiCallId,
        vapi_assistant_id: vapiAssistantId,
        vapi_phone_number_id: vapiPhoneNumberId ?? null,
        transcript: payload,
        created_at: now,
      }, { onConflict: 'vapi_call_id' });

    if (upsertErr) throw upsertErr;

    // If this is a tool-calls event, persist relevant tool actions (starting with callback leads)
    const msg = payload?.message;
    if (msg?.type === 'tool-calls' && Array.isArray(msg?.toolCalls)) {
      for (const tc of msg.toolCalls) {
        const fn = tc?.function;
        const name = (fn?.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const args = fn?.arguments ?? {};

        if (name === 'leadcreatecallbackrequest') {
          const phone = args.phone ?? null;
          const reason = args.reason ?? null;
          const preferred = args.preferred_time_window ?? args.preferred_time ?? null;

          if (phone && reason) {
            await supabase.from('leads').insert({
              tenant_id: tenantId,
              phone,
              reason,
              preferred_time: preferred,
              details_json: { source: 'vapi-tool-calls', toolCallId: tc?.id ?? null },
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
});
