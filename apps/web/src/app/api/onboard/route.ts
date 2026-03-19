import { NextResponse } from 'next/server';

const DEFAULT_TIMEZONE = 'Europe/London';
const MIN_PASSWORD_LENGTH = 8;

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
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function parseBody(body: unknown) {
  if (!body || typeof body !== 'object') {
    return { ok: false as const, error: 'Invalid JSON body' };
  }

  const input = body as Record<string, unknown>;
  const business_name = typeof input.business_name === 'string' ? input.business_name.trim() : '';
  const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
  const password = typeof input.password === 'string' ? input.password : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : undefined;
  const timezone = typeof input.timezone === 'string' && input.timezone.trim()
    ? input.timezone.trim()
    : DEFAULT_TIMEZONE;

  if (!business_name || business_name.length < 2 || business_name.length > 120) {
    return { ok: false as const, error: 'business_name must be between 2 and 120 characters' };
  }

  if (!email || !isValidEmail(email)) {
    return { ok: false as const, error: 'A valid email is required' };
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false as const, error: `password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }

  if (phone && !isValidPhone(phone)) {
    return { ok: false as const, error: 'phone format is invalid' };
  }

  if (!isValidTimezone(timezone)) {
    return { ok: false as const, error: 'timezone must be a valid IANA timezone' };
  }

  return {
    ok: true as const,
    data: {
      business_name,
      email,
      password,
      phone,
      timezone,
    },
  };
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: 'Supabase server environment is not configured' },
      { status: 500 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = parseBody(body);

  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/onboard-tenant`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    body: JSON.stringify(parsed.data),
    cache: 'no-store',
  });

  const result = await response.json().catch(() => ({ error: 'Invalid response from onboarding function' }));

  return NextResponse.json(
    {
      ok: response.ok,
      ...result,
    },
    { status: response.status },
  );
}
