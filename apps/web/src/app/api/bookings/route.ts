import { NextResponse } from 'next/server';
import { supabaseAdmin } from '../../../lib/supabaseAdmin';

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('bookings')
    .select('id, created_at, tenant_id, service_name, start_at, end_at, status, customer_phone, customer_name, calendar_event_id')
    .order('start_at', { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
