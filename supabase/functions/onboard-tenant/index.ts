import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://pmfvfggpaphwkdtvsndk.supabase.co";
const DEFAULT_TIMEZONE = "Europe/London";
const MIN_PASSWORD_LENGTH = 8;

const corsHeaders = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
};

type OnboardPayload = {
  business_name: string;
  email: string;
  password: string;
  phone?: string;
  timezone?: string;
};

type JsonBody = Record<string, unknown>;

function json(status: number, body: JsonBody) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function getServiceClient() {
  const key = Deno.env.get("SERVICE_ROLE_KEY");
  if (!key) throw new Error("SERVICE_ROLE_KEY not set");

  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "echo-ai-receptionist/onboard-tenant" } },
  });
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string) {
  return /^[0-9+()\-\s]{7,20}$/.test(phone);
}

function isValidTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function parsePayload(input: unknown): { ok: true; data: OnboardPayload } | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Invalid JSON body" };
  }

  const body = input as Record<string, unknown>;
  const business_name = typeof body.business_name === "string" ? body.business_name.trim() : "";
  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : undefined;
  const timezone = typeof body.timezone === "string" && body.timezone.trim() ? body.timezone.trim() : DEFAULT_TIMEZONE;

  if (!business_name || business_name.length < 2 || business_name.length > 120) {
    return { ok: false, error: "business_name must be between 2 and 120 characters" };
  }

  if (!email || !isValidEmail(email)) {
    return { ok: false, error: "A valid email is required" };
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }

  if (phone && !isValidPhone(phone)) {
    return { ok: false, error: "phone format is invalid" };
  }

  if (!isValidTimezone(timezone)) {
    return { ok: false, error: "timezone must be a valid IANA timezone" };
  }

  return {
    ok: true,
    data: {
      business_name,
      email,
      password,
      phone: phone || undefined,
      timezone,
    },
  };
}

async function rollbackUser(supabase: SupabaseClient, userId: string) {
  try {
    await supabase.auth.admin.deleteUser(userId);
  } catch {
    // Best-effort rollback only.
  }
}

async function createAuthUser(supabase: SupabaseClient, payload: OnboardPayload) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: payload.email,
    password: payload.password,
    email_confirm: false,
    user_metadata: {
      business_name: payload.business_name,
      phone: payload.phone ?? null,
      timezone: payload.timezone ?? DEFAULT_TIMEZONE,
    },
  });

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists") || error.status === 422) {
      return { ok: false as const, status: 409, error: "A user with that email already exists" };
    }

    return { ok: false as const, status: 400, error: error.message };
  }

  const user = data.user;
  if (!user?.id) {
    return { ok: false as const, status: 500, error: "Auth user was not created" };
  }

  return { ok: true as const, user };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const raw = await req.json().catch(() => null);
    const parsed = parsePayload(raw);

    if (!parsed.ok) {
      return json(400, { error: parsed.error });
    }

    const payload = parsed.data;
    const supabase = getServiceClient();

    const created = await createAuthUser(supabase, payload);
    if (!created.ok) {
      return json(created.status, { error: created.error });
    }

    const userId = created.user.id;

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({
        name: payload.business_name,
        timezone: payload.timezone ?? DEFAULT_TIMEZONE,
      })
      .select("id")
      .single();

    if (tenantError || !tenant?.id) {
      await rollbackUser(supabase, userId);
      return json(500, { error: tenantError?.message ?? "Failed to create tenant" });
    }

    const tenantId = tenant.id as string;

    const { error: membershipError } = await supabase.from("tenant_users").insert({
      tenant_id: tenantId,
      user_id: userId,
      role: "owner",
    });

    if (membershipError) {
      await supabase.from("tenants").delete().eq("id", tenantId);
      await rollbackUser(supabase, userId);
      return json(500, { error: membershipError.message });
    }

    const { error: locationError } = await supabase.from("tenant_locations").insert({
      tenant_id: tenantId,
      name: payload.business_name,
    });

    if (locationError) {
      await supabase.from("tenants").delete().eq("id", tenantId);
      await rollbackUser(supabase, userId);
      return json(500, { error: locationError.message });
    }

    return json(200, {
      tenant_id: tenantId,
      user_id: userId,
      message: "Tenant onboarding completed successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(500, { error: message });
  }
});
