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

async function getGoogleAccessToken(supabase: ReturnType<typeof getServiceClient>, tenantId: string): Promise<string> {
  const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Google OAuth secrets not set');

  const { data: sec, error: secErr } = await supabase
    .from('integration_secrets')
    .select('encrypted_json')
    .eq('tenant_id', tenantId)
    .eq('provider', 'google_calendar')
    .maybeSingle();
  if (secErr) throw secErr;
  if (!sec?.encrypted_json?.access_token) throw new Error('Google Calendar not connected for tenant');

  let token = sec.encrypted_json.access_token as string;

  // Verify token quickly; if unauthorized, refresh.
  const test = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + encodeURIComponent(token));
  if (test.ok) return token;

  const refreshToken = sec.encrypted_json.refresh_token as string | undefined;
  if (!refreshToken) throw new Error('Missing refresh_token for Google Calendar integration');

  const form = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });

  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('Google token refresh failed');

  token = j.access_token;
  sec.encrypted_json.access_token = token;
  await supabase
    .from('integration_secrets')
    .update({ encrypted_json: sec.encrypted_json, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('provider', 'google_calendar');

  return token;
}

async function getGoogleCalendarId(supabase: ReturnType<typeof getServiceClient>, tenantId: string): Promise<string> {
  const { data, error } = await supabase
    .from('integrations')
    .select('config_json')
    .eq('tenant_id', tenantId)
    .eq('provider', 'google_calendar')
    .maybeSingle();
  if (error) throw error;
  const calendarId = data?.config_json?.calendar_id;
  if (!calendarId) throw new Error('Google calendar_id not set for tenant');
  return calendarId as string;
}

async function googleFreeBusy(opts: {
  accessToken: string;
  calendarId: string;
  timeMin: string;
  timeMax: string;
  timeZone: string;
}): Promise<Array<{ start: string; end: string }>> {
  const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${opts.accessToken}`,
    },
    body: JSON.stringify({
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      timeZone: opts.timeZone,
      items: [{ id: opts.calendarId }],
    }),
  });

  const j = await r.json();
  if (!r.ok) throw new Error(`Google freeBusy failed: ${JSON.stringify(j)}`);
  return j?.calendars?.[opts.calendarId]?.busy ?? [];
}

async function googleCreateEvent(opts: {
  accessToken: string;
  calendarId: string;
  summary: string;
  start: string;
  end: string;
  timeZone: string;
  description?: string;
}) {
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(opts.calendarId)}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${opts.accessToken}`,
    },
    body: JSON.stringify({
      summary: opts.summary,
      description: opts.description ?? undefined,
      start: { dateTime: opts.start, timeZone: opts.timeZone },
      end: { dateTime: opts.end, timeZone: opts.timeZone },
    }),
  });

  const j = await r.json();
  if (!r.ok) throw new Error(`Google create event failed: ${JSON.stringify(j)}`);
  return j;
}

async function googleUpdateEvent(opts: {
  accessToken: string;
  calendarId: string;
  eventId: string;
  start: string;
  end: string;
  timeZone: string;
}) {
  const r = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(opts.calendarId)}/events/${encodeURIComponent(opts.eventId)}`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        Authorization: `Bearer ${opts.accessToken}`,
      },
      body: JSON.stringify({
        start: { dateTime: opts.start, timeZone: opts.timeZone },
        end: { dateTime: opts.end, timeZone: opts.timeZone },
      }),
    },
  );

  const j = await r.json();
  if (!r.ok) throw new Error(`Google update event failed: ${JSON.stringify(j)}`);
  return j;
}

async function googleDeleteEvent(opts: {
  accessToken: string;
  calendarId: string;
  eventId: string;
}) {
  const r = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(opts.calendarId)}/events/${encodeURIComponent(opts.eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${opts.accessToken}` },
    },
  );
  if (r.status !== 204 && !r.ok) {
    const t = await r.text();
    throw new Error(`Google delete event failed: ${t}`);
  }
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

  const timeZone = args?.timezone ?? 'Europe/London';
  const summary = args?.service_name ?? 'Appointment';

  // Guardrail: prevent obviously wrong dates (e.g. far in the past).
  const startMs = new Date(start).getTime();
  const nowMs = Date.now();
  if (!Number.isFinite(startMs)) {
    return { ok: false, error: 'Invalid start_datetime format. Must be ISO 8601.' };
  }
  if (startMs < nowMs - 24 * 60 * 60 * 1000) {
    return { ok: false, error: 'Requested start time appears to be in the past. Please confirm the date.' };
  }

  // Google Calendar mirroring
  const accessToken = await getGoogleAccessToken(supabase, tenantId);
  const calendarId = await getGoogleCalendarId(supabase, tenantId);

  // Prevent double-bookings: check free/busy for the exact requested window.
  const busy = await googleFreeBusy({ accessToken, calendarId, timeMin: start, timeMax: end, timeZone });
  if (busy.length) {
    // Suggest next available slots (30-min steps, next 8 hours)
    const durMin = Math.max(5, Number(args?.duration_minutes ?? 30));
    const stepMin = 30;
    const startMs2 = new Date(start).getTime();
    const windowEndMs = startMs2 + 8 * 60 * 60 * 1000;
    const busyMs = busy.map((b) => ({ s: new Date(b.start).getTime(), e: new Date(b.end).getTime() }));
    const overlaps = (s: number, e: number) => busyMs.some((b) => s < b.e && e > b.s);

    const suggestions: string[] = [];
    for (let t = startMs2; t < windowEndMs && suggestions.length < 3; t += stepMin * 60 * 1000) {
      const s = t;
      const e = t + durMin * 60 * 1000;
      if (!overlaps(s, e)) suggestions.push(new Date(s).toISOString());
    }

    const busyStr = busy.slice(0, 3).map((b) => `${b.start}-${b.end}`).join(', ');
    const sugStr = suggestions.length ? ` Next available starts: ${suggestions.join(', ')}` : '';
    return { ok: false, error: `Requested time is not available. Busy: ${busyStr}.${sugStr}` };
  }

  const ev = await googleCreateEvent({
    accessToken,
    calendarId,
    summary,
    start,
    end,
    timeZone,
    description: args?.notes ?? undefined,
  });

  const record = {
    tenant_id: tenantId,
    location_id: null,
    service_name: args?.service_name ?? null,
    notes: args?.notes ?? null,
    start_at: start,
    end_at: end,
    calendar_provider: 'google',
    calendar_id: calendarId,
    calendar_event_id: ev.id ?? null,
    customer_phone: phone,
    customer_name: customer?.name ?? null,
    customer_email: customer?.email ?? null,
    customer_json: customer,
    status: 'confirmed',
  };

  const { data, error } = await supabase
    .from('bookings')
    .insert(record)
    .select('id')
    .single();

  if (error) return { ok: false, error: `DB insert failed: ${error.message}` };

  return { ok: true, result: `Booking created (bookingId=${data.id}, googleEventId=${ev.id}, start=${start}, end=${end})` };
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

async function bookingCheckAvailabilityGoogle(supabase: ReturnType<typeof getServiceClient>, tenantId: string, args: any) {
  const timeZone = args?.timezone ?? 'Europe/London';

  let start = args?.start_datetime ?? (args?.date ? `${args.date}T00:00:00Z` : null);
  let end = args?.end_datetime ?? null;

  // If caller gives a start time + duration, compute end.
  if (!end && args?.start_datetime && args?.duration_minutes) {
    const ms = Number(args.duration_minutes) * 60 * 1000;
    const d = new Date(args.start_datetime);
    end = new Date(d.getTime() + ms).toISOString();
    start = d.toISOString();
  }

  // If only a date is given, check the whole day (UTC bounds) as a fallback.
  if (!end && args?.date) {
    end = `${args.date}T23:59:59Z`;
  }

  if (!start || !end) {
    return { ok: false, error: 'Missing required fields: provide start_datetime+end_datetime, or start_datetime+duration_minutes, or date' };
  }

  const accessToken = await getGoogleAccessToken(supabase, tenantId);
  const calendarId = await getGoogleCalendarId(supabase, tenantId);

  let busy: Array<{ start: string; end: string }> = [];
  try {
    busy = await googleFreeBusy({ accessToken, calendarId, timeMin: start, timeMax: end, timeZone });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }

  if (!busy.length) {
    return { ok: true, result: `Available between ${start} and ${end} (${timeZone})` };
  }

  // Suggest next available slots (simple 30-min step search)
  const durMin = Number(args?.duration_minutes ?? 30);
  const stepMin = 30;
  const startMs = new Date(start).getTime();
  const windowEndMs = startMs + 8 * 60 * 60 * 1000; // search next 8 hours
  const busyMs = busy
    .map((b) => ({ s: new Date(b.start).getTime(), e: new Date(b.end).getTime() }))
    .filter((b) => Number.isFinite(b.s) && Number.isFinite(b.e));

  function overlaps(s: number, e: number) {
    return busyMs.some((b) => s < b.e && e > b.s);
  }

  const suggestions: string[] = [];
  for (let t = startMs; t < windowEndMs && suggestions.length < 3; t += stepMin * 60 * 1000) {
    const s = t;
    const e = t + durMin * 60 * 1000;
    if (!overlaps(s, e)) suggestions.push(new Date(s).toISOString());
  }

  const ranges = busy.slice(0, 3).map((b) => `${b.start}-${b.end}`).join(', ');
  if (suggestions.length) {
    return { ok: true, result: `Not available. Busy: ${ranges}. Next available starts: ${suggestions.join(', ')}` };
  }

  return { ok: true, result: `Not available. Busy: ${ranges}. No alternative slots found in next 8 hours.` };
}

async function findBookingId(supabase: ReturnType<typeof getServiceClient>, tenantId: string, args: any) {
  const bookingId = args?.booking_id ?? null;
  if (bookingId) return bookingId as string;

  const lookup = args?.lookup ?? {};
  const phone = lookup?.phone ?? args?.phone ?? null;
  const approxDate = lookup?.approx_date ?? null;

  if (!phone) return null;

  let q = supabase
    .from('bookings')
    .select('id,start_at')
    .eq('tenant_id', tenantId)
    .eq('customer_phone', phone)
    .order('start_at', { ascending: false })
    .limit(1);

  if (approxDate) {
    q = q.gte('start_at', `${approxDate}T00:00:00Z`).lte('start_at', `${approxDate}T23:59:59Z`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return data?.[0]?.id ?? null;
}

async function bookingCancelDbOnly(supabase: ReturnType<typeof getServiceClient>, tenantId: string, args: any) {
  const id = await findBookingId(supabase, tenantId, args);
  if (!id) return { ok: false, error: 'Could not find booking to cancel. Ask for phone number and approximate date.' };

  const { data: existing, error: exErr } = await supabase
    .from('bookings')
    .select('calendar_provider, calendar_id, calendar_event_id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  if (exErr) throw exErr;

  if (existing?.calendar_provider === 'google' && existing?.calendar_id && existing?.calendar_event_id) {
    const accessToken = await getGoogleAccessToken(supabase, tenantId);
    await googleDeleteEvent({
      accessToken,
      calendarId: existing.calendar_id,
      eventId: existing.calendar_event_id,
    });
  }

  const { error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('tenant_id', tenantId)
    .eq('id', id);

  if (error) return { ok: false, error: `Cancel failed: ${error.message}` };

  return { ok: true, result: `Booking cancelled (bookingId=${id})` };
}

async function bookingRescheduleDbOnly(supabase: ReturnType<typeof getServiceClient>, tenantId: string, args: any) {
  const id = await findBookingId(supabase, tenantId, args);
  if (!id) return { ok: false, error: 'Could not find booking to reschedule. Ask for phone number and approximate date.' };

  const newStart = args?.new_start_datetime;
  const newEnd = args?.new_end_datetime;
  if (!newStart || !newEnd) return { ok: false, error: 'Missing required fields: new_start_datetime, new_end_datetime' };

  const reason = args?.reason ?? null;
  const timeZone = args?.timezone ?? 'Europe/London';

  const { data: existing, error: exErr } = await supabase
    .from('bookings')
    .select('notes, calendar_provider, calendar_id, calendar_event_id')
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  if (exErr) throw exErr;

  if (existing?.calendar_provider === 'google' && existing?.calendar_id && existing?.calendar_event_id) {
    const accessToken = await getGoogleAccessToken(supabase, tenantId);
    await googleUpdateEvent({
      accessToken,
      calendarId: existing.calendar_id,
      eventId: existing.calendar_event_id,
      start: newStart,
      end: newEnd,
      timeZone,
    });
  }

  const notes = [existing?.notes, reason ? `Reschedule reason: ${reason}` : null].filter(Boolean).join(' | ') || null;

  const { error } = await supabase
    .from('bookings')
    .update({ start_at: newStart, end_at: newEnd, status: 'rescheduled', notes })
    .eq('tenant_id', tenantId)
    .eq('id', id);

  if (error) return { ok: false, error: `Reschedule failed: ${error.message}` };

  return { ok: true, result: `Booking rescheduled (bookingId=${id} newStart=${newStart})` };
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
      else if (name === "bookingcheckavailability") r = await bookingCheckAvailabilityGoogle(supabase, tenantId, args);
      else if (name === "bookingcancel") r = await bookingCancelDbOnly(supabase, tenantId, args);
      else if (name === "bookingreschedule") r = await bookingRescheduleDbOnly(supabase, tenantId, args);
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
