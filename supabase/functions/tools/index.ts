// Supabase Edge Function: tools
// Multi-tenant tool router for Vapi function calls.
// Auth: Vapi Custom Credentials (Authorization: Bearer <token>).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = "https://pmfvfggpaphwkdtvsndk.supabase.co";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function unauthorized() {
  return new Response("Unauthorized", { status: 401 });
}

function checkAuth(req: Request): boolean {
  const expected = Deno.env.get("VAPI_SERVER_BEARER_TOKEN");
  if (!expected) return true;

  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return !!m && m[1] === expected;
}

function getServiceClient() {
  const key = Deno.env.get("SERVICE_ROLE_KEY");
  if (!key) throw new Error("SERVICE_ROLE_KEY not set");
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "echo-ai-receptionist/tools" } },
  });
}

function pickFirst<T>(...vals: Array<T | undefined | null>): T | undefined {
  for (const v of vals) if (v !== undefined && v !== null) return v as T;
  return undefined;
}

function extractContext(payload: any) {
  const assistantId = pickFirst<string>(
    payload?.assistantId,
    payload?.assistant?.id,
    payload?.call?.assistantId,
    payload?.message?.call?.assistantId,
    payload?.data?.assistantId,
  );

  const callId = pickFirst<string>(
    payload?.callId,
    payload?.call?.id,
    payload?.message?.call?.id,
    payload?.data?.call?.id,
    payload?.id,
  );

  // Vapi tool payloads commonly include function name + args/parameters in different shapes.
  const toolName = pickFirst<string>(
    payload?.toolName,
    payload?.name,
    payload?.functionName,
    payload?.function?.name,
    payload?.toolCall?.name,
  );

  const params = pickFirst<any>(
    payload?.parameters,
    payload?.args,
    payload?.arguments,
    payload?.function?.arguments,
    payload?.toolCall?.parameters,
    payload?.toolCall?.arguments,
    payload?.payload,
    payload,
  );

  return { assistantId, callId, toolName, params };
}

async function resolveTenantId(supabase: ReturnType<typeof getServiceClient>, assistantId?: string) {
  if (!assistantId) return undefined;
  const { data, error } = await supabase
    .from("vapi_assistants")
    .select("tenant_id")
    .eq("vapi_assistant_id", assistantId)
    .maybeSingle();
  if (error) throw error;
  return (data?.tenant_id as string | undefined) ?? undefined;
}

async function createCallbackLead(supabase: ReturnType<typeof getServiceClient>, tenantId: string, params: any) {
  const lead = {
    tenant_id: tenantId,
    name: params?.name ?? null,
    phone: params?.phone ?? null,
    email: params?.email ?? null,
    reason: params?.reason ?? null,
    urgency: params?.urgency ?? null,
    preferred_time: params?.preferred_time_window ?? params?.preferred_time ?? null,
    details_json: {
      notes: params?.notes ?? null,
      location_hint: params?.location_hint ?? null,
    },
  };

  if (!lead.phone || !lead.reason) {
    return json(400, { ok: false, error: "MISSING_REQUIRED_FIELDS", required: ["phone", "reason"] });
  }

  const { data, error } = await supabase.from("leads").insert(lead).select("id, status, created_at").single();
  if (error) throw error;

  return json(200, { ok: true, leadId: data.id, status: data.status, createdAt: data.created_at });
}

async function bookingCreateDbOnly(supabase: ReturnType<typeof getServiceClient>, tenantId: string, params: any) {
  const customer = params?.customer ?? {};

  const start = params?.start_datetime;
  const end = params?.end_datetime;
  const phone = customer?.phone;

  if (!start || !end || !phone) {
    return json(400, { ok: false, error: "MISSING_REQUIRED_FIELDS", required: ["start_datetime", "end_datetime", "customer.phone"] });
  }

  const record = {
    tenant_id: tenantId,
    location_id: null,
    start_at: start,
    end_at: end,
    calendar_provider: null,
    calendar_id: null,
    calendar_event_id: null,
    customer_phone: phone,
    customer_name: customer?.name ?? null,
    customer_email: customer?.email ?? null,
    customer_json: customer,
    status: 'pending_calendar',
  };

  const { data, error } = await supabase
    .from('bookings')
    .insert(record)
    .select('id, status, start_at, end_at')
    .single();
  if (error) throw error;

  return json(200, { ok: true, bookingId: data.id, status: data.status, start_at: data.start_at, end_at: data.end_at });
}

async function bookingLookup(supabase: ReturnType<typeof getServiceClient>, tenantId: string, params: any) {
  const phone = params?.phone;
  if (!phone) return json(400, { ok: false, error: 'MISSING_REQUIRED_FIELDS', required: ['phone'] });

  const fromDate = params?.from_date;
  const toDate = params?.to_date;

  let q = supabase
    .from('bookings')
    .select('id, start_at, end_at, status, customer_phone, customer_name, calendar_event_id')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', phone)
    .order('start_at', { ascending: false })
    .limit(5);

  if (fromDate) q = q.gte('start_at', `${fromDate}T00:00:00Z`);
  if (toDate) q = q.lte('start_at', `${toDate}T23:59:59Z`);

  const { data, error } = await q;
  if (error) throw error;

  return json(200, { ok: true, results: data ?? [] });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    if (!checkAuth(req)) return unauthorized();

    const payload = await req.json();
    const { assistantId, callId, toolName, params } = extractContext(payload);

    const supabase = getServiceClient();
    const tenantId = await resolveTenantId(supabase, assistantId);

    if (!tenantId) {
      return json(400, {
        ok: false,
        error: "TENANT_NOT_RESOLVED",
        hint: "Ensure assistantId is present and mapped in vapi_assistants table.",
        assistantId,
        callId,
        toolName,
      });
    }

    // If Vapi sends the "tool-calls" event shape here, execute tool calls from message.toolCalls.
    const msg = payload?.message;
    if (msg?.type === 'tool-calls' && Array.isArray(msg?.toolCalls)) {
      // Log the raw event
      await supabase.from('tool_calls').insert({
        tenant_id: tenantId,
        vapi_call_id: msg?.call?.id ?? callId ?? null,
        assistant_id: msg?.call?.assistantId ?? assistantId ?? null,
        tool_name: 'tool-calls',
        payload,
      });

      for (const tc of msg.toolCalls) {
        const fn = tc?.function;
        const name = (fn?.name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const args = fn?.arguments ?? {};

        // Log each tool call
        await supabase.from('tool_calls').insert({
          tenant_id: tenantId,
          vapi_call_id: msg?.call?.id ?? callId ?? null,
          assistant_id: msg?.call?.assistantId ?? assistantId ?? null,
          tool_name: fn?.name ?? null,
          payload: tc,
        });

        if (name === 'leadcreatecallbackrequest') {
          // Use same validator/insert path
          const resp = await createCallbackLead(supabase, tenantId, args);
          if (resp.status >= 400) return resp;
          continue;
        }

        // Recognize other tools so we never hit "unrecognized" issues again.
        if (name === 'bookingcreate') {
          const resp = await bookingCreateDbOnly(supabase, tenantId, args);
          if (resp.status >= 400) return resp;
          continue;
        }

        if (name === 'bookinglookup') {
          const resp = await bookingLookup(supabase, tenantId, args);
          if (resp.status >= 400) return resp;
          continue;
        }

        if (
          name === 'bookingcheckavailability' ||
          name === 'bookingreschedule' ||
          name === 'bookingcancel' ||
          name === 'messagesendsms'
        ) {
          return json(501, { ok: false, error: 'NOT_IMPLEMENTED', toolName: fn?.name ?? null });
        }
      }

      return json(200, { ok: true });
    }

    // Log every inbound tool call for debugging/audit (non tool-calls event shapes)
    await supabase.from('tool_calls').insert({
      tenant_id: tenantId,
      vapi_call_id: callId ?? null,
      assistant_id: assistantId ?? null,
      tool_name: toolName ?? null,
      payload,
    });

    // Normalize tool names (Vapi tool names often can't include dots)
    const key = (toolName ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Route
    switch (key) {
      case "leadcreatecallbackrequest":
      case "leadcreatecallback":
        return await createCallbackLead(supabase, tenantId, params);

      // Booking tools
      case "bookingcreate":
        return await bookingCreateDbOnly(supabase, tenantId, params);
      case "bookinglookup":
        return await bookingLookup(supabase, tenantId, params);
      case "bookingcheckavailability":
      case "bookingreschedule":
      case "bookingcancel":
        return json(501, { ok: false, error: "NOT_IMPLEMENTED", toolName });

      // message.sendSms
      case "messagesendsms":
        return json(501, { ok: false, error: "NOT_IMPLEMENTED", toolName });

      default:
        return json(400, { ok: false, error: "UNKNOWN_TOOL", toolName, assistantId, callId });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json(500, { ok: false, error: msg });
  }
});
