import { NextResponse } from 'next/server';
import { badRequest, BOOKING_STATUSES, notFound, requireUserTenantIds } from '@/lib/ops';
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
    .from('bookings')
    .select('id, created_at, tenant_id, location_id, start_at, end_at, calendar_provider, calendar_id, calendar_event_id, customer_json, customer_name, customer_phone, customer_email, service_name, notes, status, tenants(name), tenant_locations(name, address)')
    .eq('id', id)
    .in('tenant_id', auth.tenantIds)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!data) {
    return notFound('booking');
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

  if (!BOOKING_STATUSES.includes(status as (typeof BOOKING_STATUSES)[number])) {
    return badRequest(`status must be one of: ${BOOKING_STATUSES.join(', ')}`);
  }

  const { id } = await context.params;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('bookings')
    .select('id')
    .eq('id', id)
    .in('tenant_id', auth.tenantIds)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
  }

  if (!existing) {
    return notFound('booking');
  }

  const { data, error } = await supabaseAdmin
    .from('bookings')
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
