import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getMembershipTenant, getUserTenantMemberships, type TenantMembership } from '@/lib/tenantMemberships';

type ActivityItem = {
  id: string;
  type: 'call' | 'lead' | 'booking';
  title: string;
  description: string;
  timestamp: string;
  status: string | null;
  tenantId: string;
};

function startOfDay(date = new Date()) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function safeLabel(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { data: memberships, error: membershipError } = await getUserTenantMemberships(user.id);

  if (membershipError) {
    return NextResponse.json({ ok: false, error: membershipError.message }, { status: 500 });
  }

  const typedMemberships = (memberships ?? []) as TenantMembership[];
  const tenantIds = typedMemberships.map((membership) => membership.tenant_id);

  if (tenantIds.length === 0) {
    return NextResponse.json({
      ok: true,
      data: {
        tenants: [],
        membershipCount: 0,
        kpis: {
          calls: 0,
          leads: 0,
          bookings: 0,
          upcomingBookings: 0,
        },
        recentActivity: [] satisfies ActivityItem[],
      },
    });
  }

  const today = startOfDay();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const upcomingWindowEnd = addDays(today, 7);

  const [
    callsCountResult,
    leadsCountResult,
    bookingsCountResult,
    upcomingBookingsCountResult,
    recentCallsResult,
    recentLeadsResult,
    recentBookingsResult,
  ] = await Promise.all([
    supabaseAdmin
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .in('tenant_id', tenantIds)
      .gte('created_at', monthStart.toISOString()),
    supabaseAdmin
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .in('tenant_id', tenantIds)
      .gte('created_at', monthStart.toISOString()),
    supabaseAdmin
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .in('tenant_id', tenantIds)
      .gte('created_at', monthStart.toISOString()),
    supabaseAdmin
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .in('tenant_id', tenantIds)
      .gte('start_at', today.toISOString())
      .lt('start_at', upcomingWindowEnd.toISOString())
      .neq('status', 'cancelled'),
    supabaseAdmin
      .from('calls')
      .select('id, created_at, tenant_id, intent, outcome, duration_sec')
      .in('tenant_id', tenantIds)
      .order('created_at', { ascending: false })
      .limit(6),
    supabaseAdmin
      .from('leads')
      .select('id, created_at, tenant_id, name, reason, status, urgency')
      .in('tenant_id', tenantIds)
      .order('created_at', { ascending: false })
      .limit(6),
    supabaseAdmin
      .from('bookings')
      .select('id, created_at, tenant_id, service_name, start_at, customer_name, status')
      .in('tenant_id', tenantIds)
      .order('start_at', { ascending: true })
      .limit(6),
  ]);

  const errors = [
    callsCountResult.error,
    leadsCountResult.error,
    bookingsCountResult.error,
    upcomingBookingsCountResult.error,
    recentCallsResult.error,
    recentLeadsResult.error,
    recentBookingsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, error: errors[0]?.message ?? 'Failed to load dashboard summary' }, { status: 500 });
  }

  const recentActivity: ActivityItem[] = [
    ...((recentCallsResult.data ?? []).map((call) => ({
      id: call.id,
      type: 'call' as const,
      title: safeLabel(call.intent, 'Incoming call'),
      description: call.duration_sec
        ? `${call.duration_sec}s · ${safeLabel(call.outcome, 'Outcome pending')}`
        : safeLabel(call.outcome, 'Call logged'),
      timestamp: call.created_at,
      status: call.outcome,
      tenantId: call.tenant_id,
    }))),
    ...((recentLeadsResult.data ?? []).map((lead) => ({
      id: lead.id,
      type: 'lead' as const,
      title: safeLabel(lead.name, 'New lead'),
      description: `${safeLabel(lead.reason, 'No reason captured')} · ${safeLabel(lead.urgency, 'normal')} priority`,
      timestamp: lead.created_at,
      status: lead.status,
      tenantId: lead.tenant_id,
    }))),
    ...((recentBookingsResult.data ?? []).map((booking) => ({
      id: booking.id,
      type: 'booking' as const,
      title: safeLabel(booking.service_name, 'Booking created'),
      description: `${safeLabel(booking.customer_name, 'Customer')} · starts ${booking.start_at ? new Date(booking.start_at).toLocaleString('en-GB') : 'soon'}`,
      timestamp: booking.created_at,
      status: booking.status,
      tenantId: booking.tenant_id,
    }))),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 12);

  return NextResponse.json({
    ok: true,
    data: {
      tenants: typedMemberships.map((membership) => ({
        tenantId: membership.tenant_id,
        role: membership.role,
        tenantName: getMembershipTenant(membership)?.name ?? null,
      })),
      membershipCount: tenantIds.length,
      kpis: {
        calls: callsCountResult.count ?? 0,
        leads: leadsCountResult.count ?? 0,
        bookings: bookingsCountResult.count ?? 0,
        upcomingBookings: upcomingBookingsCountResult.count ?? 0,
      },
      recentActivity,
    },
  });
}
