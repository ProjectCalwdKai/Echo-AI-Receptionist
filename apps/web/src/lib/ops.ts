import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from './supabase/server';
import { supabaseAdmin } from './supabaseAdmin';

export { BOOKING_STATUSES, LEAD_STATUSES } from './ops.constants';
export type { BookingStatus, LeadStatus } from './ops.constants';

export async function requireUserTenantIds(): Promise<
  | { ok: true; userId: string; tenantIds: string[] }
  | { ok: false; response: NextResponse }
> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    };
  }

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id);

  if (membershipError) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: membershipError.message }, { status: 500 }),
    };
  }

  return {
    ok: true,
    userId: user.id,
    tenantIds: memberships?.map((membership) => membership.tenant_id) ?? [],
  };
}

export function badRequest(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 });
}

export function notFound(entity = 'record') {
  return NextResponse.json({ ok: false, error: `${entity}_not_found` }, { status: 404 });
}
