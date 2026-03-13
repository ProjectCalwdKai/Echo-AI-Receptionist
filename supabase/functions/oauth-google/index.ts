// Supabase Edge Function: oauth-google
// Minimal per-tenant Google OAuth for Calendar.
// Routes:
//  - GET ?action=start&tenantId=<uuid>
//  - GET ?action=callback&code=...&state=...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = "https://pmfvfggpaphwkdtvsndk.supabase.co";

function getServiceClient() {
  const key = Deno.env.get("SERVICE_ROLE_KEY");
  if (!key) throw new Error("SERVICE_ROLE_KEY not set");
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false },
    global: { headers: { "X-Client-Info": "echo-ai-receptionist/oauth-google" } },
  });
}

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function redirect(to: string) {
  return new Response(null, { status: 302, headers: { location: to } });
}

function randomState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") ?? "";

    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return html("Missing GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET in function secrets", 500);
    }

    const redirectUri = `${SUPABASE_URL}/functions/v1/oauth-google?action=callback`;
    const supabase = getServiceClient();

    if (action === "start") {
      const tenantId = url.searchParams.get("tenantId");
      if (!tenantId) return html("Missing tenantId", 400);

      const state = randomState();
      const { error } = await supabase.from("oauth_states").insert({ state, tenant_id: tenantId, provider: "google" });
      if (error) return html(`Failed to create oauth state: ${error.message}`, 500);

      const scope = encodeURIComponent([
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
      ].join(" "));

      const authUrl =
        "https://accounts.google.com/o/oauth2/v2/auth" +
        `?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${scope}` +
        `&access_type=offline` +
        `&prompt=consent` +
        `&state=${encodeURIComponent(state)}`;

      return redirect(authUrl);
    }

    if (action === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (!code || !state) return html("Missing code/state", 400);

      const { data: st, error: stErr } = await supabase
        .from("oauth_states")
        .select("tenant_id")
        .eq("state", state)
        .maybeSingle();

      if (stErr) return html(`State lookup failed: ${stErr.message}`, 500);
      if (!st?.tenant_id) return html("Invalid/expired state", 400);

      const tenantId = st.tenant_id as string;

      // Exchange code for tokens
      const form = new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      });

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: form,
      });

      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok) {
        return html(`Token exchange failed: ${JSON.stringify(tokenJson)}`, 500);
      }

      // Store tokens per tenant
      const { error: secErr } = await supabase
        .from("integration_secrets")
        .upsert({ tenant_id: tenantId, provider: "google_calendar", encrypted_json: tokenJson, updated_at: new Date().toISOString() });
      if (secErr) return html(`Failed to store tokens: ${secErr.message}`, 500);

      const { error: intErr } = await supabase
        .from("integrations")
        .upsert({ tenant_id: tenantId, provider: "google_calendar", status: "connected", connected_at: new Date().toISOString() });
      if (intErr) return html(`Failed to upsert integrations row: ${intErr.message}`, 500);

      // Consume state
      await supabase.from("oauth_states").delete().eq("state", state);

      return html("Google Calendar connected successfully. You can close this window.");
    }

    return html("Invalid action. Use ?action=start or ?action=callback", 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return html(`Unhandled error: ${msg}`, 500);
  }
});
