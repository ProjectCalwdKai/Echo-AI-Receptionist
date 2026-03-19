import { NextResponse } from 'next/server';
import { requireUserTenantIds } from '@/lib/ops';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET() {
  const auth = await requireUserTenantIds();
  if (!auth.ok) {
    return auth.response;
  }

  if (auth.tenantIds.length === 0) {
    return NextResponse.json({ ok: true, data: [] });
  }

  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('id, created_at, tenant_id, service_name, start_at, end_at, status, customer_phone, customer_name, customer_email, calendar_event_id')
    .in('tenant_id', auth.tenantIds)
    .order('start_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
