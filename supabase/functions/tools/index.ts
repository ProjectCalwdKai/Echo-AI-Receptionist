// Supabase Edge Function: tools
// Executes Vapi custom tools.
// IMPORTANT: Vapi requires HTTP 200 with { results: [{ toolCallId, result|error }] }
// where result/error are SINGLE-LINE STRINGS.
// Ref: https://docs.vapi.ai/tools/custom-tools-troubleshooting#no-result-returned-error

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = "https://pmfvfggpaphwkdtvsndk.supabase.co";

function respond(results: Array<{ toolCallId: string; result?: string; error?: string }>) {
  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function unauthorized() {
  // Even auth failures must be returned in results format when we have a toolCallId.
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

function normalizeName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function extractAssistantId(payload: any) {
  return pickFirst<string>(
    payload?.assistantId,
    payload?.assistant?.id,
    payload?.call?.assistantId,
    payload?.message?.call?.assistantId,
    payload?.data?.assistantId,
  );
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

async function logToolCall(supabase: ReturnType<typeof getServiceClient>, tenantId: string, tc: any, meta?: any) {
  await supabase.from("tool_calls").insert({
    tenant_id: tenantId,
    vapi_call_id: meta?.callId ?? null,
    assistant_id: meta?.assistantId ?? null,
    tool_name: meta?.toolName ?? null,
    payload: tc,
  });
}

async function createCallbackLead(supabase: ReturnType<typeof getServiceClient>, tenantId: string, args: any) {
  const phone = args?.phone ?? null;
  const reason = args?.reason ?? null;
  const preferred = args?.preferred_time_window ?? args?.preferred_time ?? null;

  if (!phone || !reason) {
    return { ok: false, error: "Missing required fields: phone, reason" };
  }

  const lead = {
    tenant_id: tenantId,
    name: args?.name ?? null,
    phone,
    email: args?.email ?? null,
    reason,
    urgency: args?.urgency ?? null,
    preferred_time: preferred,
    details_json: {
      notes: args?.notes ?? null,
      location_hint: args?.location_hint ?? null,
    },
  };

  const { data, error } = await supabase
    .from("leads")
    .insert(lead)
    .select("id")
    .single();

  if (error) return { ok: false, error: `DB insert failed: ${error.message}` };

  return { ok: true, result: `Callback request saved (leadId=${data.id})` };
}

async function bookingCreateDbOnly(supabase: ReturnType<typeof getServiceClient>, tenantId: string, args: any) {
  const customer = args?.customer ?? {};
  const start = args?.start_datetime;
  const end = args?.end_datetime;
  const phone = customer?.phone;

  if (!start || !end || !phone) {
    return { ok: false, error: "Missing required fields: start_datetime, end_datetime, customer.phone" };
  }

  const record = {
    tenant_id: tenantId,
    location_id: null,
    service_name: args?.service_name ?? null,
    notes: args?.notes ?? null,
    start_at: start,
    end_at: end,
    calendar_provider: null,
    calendar_id: null,
    calendar_event_id: null,
    customer_phone: phone,
    customer_name: customer?.name ?? null,
    customer_email: customer?.email ?? null,
    customer_json: customer,
    status: "pending_calendar",
  };

  const { data, error } = await supabase
    .from("bookings")
    .insert(record)
    .select("id")
    .single();

  if (error) return { ok: false, error: `DB insert failed: ${error.message}` };

  return { ok: true, result: `Booking created (bookingId=${data.id}, status=pending_calendar)` };
}

async function bookingLookup(supabase: ReturnType<typeof getServiceClient>, tenantId: string, args: any) {
  const phone = args?.phone;
  if (!phone) return { ok: false, error: "Missing required field: phone" };

  const { data, error } = await supabase
    .from("bookings")
    .select("id,start_at,end_at,status,service_name,customer_phone,customer_name")
    .eq("tenant_id", tenantId)
    .eq("customer_phone", phone)
    .order("start_at", { ascending: false })
    .limit(5);

  if (error) return { ok: false, error: `Lookup failed: ${error.message}` };

  if (!data || data.length === 0) return { ok: true, result: "No bookings found for that phone number." };

  // Single-line summary
  const summary = data
    .map((b: any) => `bookingId=${b.id} start=${b.start_at} service=${b.service_name ?? 'n/a'} status=${b.status}`)
    .join(" | ");

  return { ok: true, result: summary };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      // Not a tool call
      return new Response("Method Not Allowed", { status: 405 });
    }
    if (!checkAuth(req)) return unauthorized();

    const payload = await req.json();
    const assistantId = extractAssistantId(payload);

    const supabase = getServiceClient();
    const tenantId = await resolveTenantId(supabase, assistantId);

    const msg = payload?.message;
    if (msg?.type !== "tool-calls" || !Array.isArray(msg?.toolCalls)) {
      // If Vapi ever sends a different shape, return a generic "no-op" result.
      return respond([{ toolCallId: "unknown", error: "Unsupported payload shape" }]);
    }

    if (!tenantId) {
      // Return errors for all tool calls
      return respond(
        msg.toolCalls.map((tc: any) => ({
          toolCallId: tc?.id ?? "unknown",
          error: "Tenant not resolved for assistantId",
        }))
      );
    }

    const results: Array<{ toolCallId: string; result?: string; error?: string }> = [];

    for (const tc of msg.toolCalls) {
      const toolCallId = tc?.id ?? "unknown";
      const fn = tc?.function;
      const rawName = fn?.name ?? "";
      const name = normalizeName(rawName);
      const args = fn?.arguments ?? {};

      await logToolCall(supabase, tenantId, tc, {
        callId: msg?.call?.id ?? null,
        assistantId: msg?.call?.assistantId ?? assistantId ?? null,
        toolName: rawName,
      });

      let r: any;
      if (name === "leadcreatecallbackrequest") r = await createCallbackLead(supabase, tenantId, args);
      else if (name === "bookingcreate") r = await bookingCreateDbOnly(supabase, tenantId, args);
      else if (name === "bookinglookup") r = await bookingLookup(supabase, tenantId, args);
      else {
        r = { ok: false, error: `Tool not implemented: ${rawName}` };
      }

      if (r.ok) results.push({ toolCallId, result: String(r.result).replace(/\r?\n/g, " ") });
      else results.push({ toolCallId, error: String(r.error).replace(/\r?\n/g, " ") });
    }

    return respond(results);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Can't reliably know toolCallIds here, so return a generic one.
    return respond([{ toolCallId: "unknown", error: msg.replace(/\r?\n/g, " ") }]);
  }
});
