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
    .from('leads')
    .select('id, created_at, tenant_id, name, phone, email, reason, urgency, preferred_time, status, tenants(name)')
    .in('tenant_id', auth.tenantIds)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
