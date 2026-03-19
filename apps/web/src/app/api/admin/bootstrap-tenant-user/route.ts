import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';
import {
  getTenantMembership,
  getUserTenantMemberships,
  isGlobalAdminEmail,
  isTenantAdminRole,
} from '../../../../lib/tenantMemberships';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { data, error } = await getUserTenantMemberships(user.id);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    adminEmailConfigured: Boolean(process.env.ADMIN_EMAIL),
    isGlobalAdmin: isGlobalAdminEmail(user.email),
    memberships: data ?? [],
  });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const tenantId = typeof body.tenantId === 'string' ? body.tenantId.trim() : '';
  const targetUserId = typeof body.targetUserId === 'string' && body.targetUserId.trim()
    ? body.targetUserId.trim()
    : user.id;
  const role = typeof body.role === 'string' && body.role.trim() ? body.role.trim() : 'owner';

  if (!tenantId) {
    return NextResponse.json({ ok: false, error: 'missing tenantId' }, { status: 400 });
  }

  let allowed = isGlobalAdminEmail(user.email);

  if (!allowed) {
    const { data: requesterMembership, error: requesterMembershipError } = await getTenantMembership(user.id, tenantId);

    if (requesterMembershipError) {
      return NextResponse.json({ ok: false, error: requesterMembershipError.message }, { status: 500 });
    }

    allowed = isTenantAdminRole(requesterMembership?.role);
  }

  if (!allowed) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const { data: tenant, error: tenantError } = await supabaseAdmin
    .from('tenants')
    .select('id, name')
    .eq('id', tenantId)
    .maybeSingle();

  if (tenantError) {
    return NextResponse.json({ ok: false, error: tenantError.message }, { status: 500 });
  }

  if (!tenant) {
    return NextResponse.json({ ok: false, error: 'tenant not found' }, { status: 404 });
  }

  const { error } = await supabaseAdmin
    .from('tenant_users')
    .upsert({ tenant_id: tenantId, user_id: targetUserId, role });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    tenantId,
    tenantName: tenant.name,
    userId: targetUserId,
    role,
  });
}
