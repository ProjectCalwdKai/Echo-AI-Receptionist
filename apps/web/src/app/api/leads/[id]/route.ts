import { NextResponse } from 'next/server';
import { badRequest, LEAD_STATUSES, notFound, requireUserTenantIds } from '@/lib/ops';
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
    .from('leads')
    .select('id, created_at, tenant_id, location_id, name, phone, email, reason, urgency, preferred_time, details_json, status, tenants(name), tenant_locations(name, address)')
    .eq('id', id)
    .in('tenant_id', auth.tenantIds)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return notFound('lead');
  }

  return NextResponse.json({ ok: true, data });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireUserTenantIds();
  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as { status?: string } | null;
  const status = body?.status?.trim();

  if (!status) {
    return badRequest('status is required');
  }

  if (!LEAD_STATUSES.includes(status as (typeof LEAD_STATUSES)[number])) {
    return badRequest(`status must be one of: ${LEAD_STATUSES.join(', ')}`);
  }

  const { id } = await context.params;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('leads')
    .select('id')
    .eq('id', id)
    .in('tenant_id', auth.tenantIds)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  }

  if (!existing) {
    return notFound('lead');
  }

  const { data, error } = await supabaseAdmin
    .from('leads')
    .update({ status })
    .eq('id', id)
    .in('tenant_id', auth.tenantIds)
    .select('id, status')
    .single();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
