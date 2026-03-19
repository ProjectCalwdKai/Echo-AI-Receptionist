import { NextResponse } from 'next/server';
import { notFound, requireUserTenantIds } from '@/lib/ops';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserTenantIds();
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;

  const { data, error } = await supabaseAdmin
    .from('calls')
    .select('id, created_at, tenant_id, vapi_call_id, vapi_assistant_id, vapi_phone_number_id, started_at, ended_at, duration_sec, intent, outcome, transcript, summary, recording_url, tenants(name)')
    .eq('id', id)
    .in('tenant_id', auth.tenantIds)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return notFound('call');
  }

  return NextResponse.json({ ok: true, data });
}
