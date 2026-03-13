import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../../../../lib/supabase/server';
import { supabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const adminEmail = process.env.ADMIN_EMAIL;
  if (adminEmail && user.email !== adminEmail) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const tenantId = body.tenantId as string | undefined;
  const role = (body.role as string | undefined) ?? 'owner';
  if (!tenantId) return NextResponse.json({ ok: false, error: 'missing tenantId' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('tenant_users')
    .upsert({ tenant_id: tenantId, user_id: user.id, role });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, tenantId, userId: user.id, role });
}
