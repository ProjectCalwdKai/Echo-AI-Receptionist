import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../lib/supabase/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id);

  if (membershipError) {
    return NextResponse.json({ ok: false, error: membershipError.message }, { status: 500 });
  }

  const tenantIds = memberships?.map((m) => m.tenant_id) ?? [];

  if (tenantIds.length === 0) {
    return NextResponse.json({ ok: true, data: [] });
  }

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('id, created_at, tenant_id, service_name, start_at, end_at, status, customer_phone, customer_name, calendar_event_id')
    .in('tenant_id', tenantIds)
    .order('start_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
