'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';

type DashboardSummary = {
  tenants: Array<{
    tenantId: string;
    tenantName: string | null;
    role: string;
  }>;
  membershipCount: number;
  kpis: {
    calls: number;
    leads: number;
    bookings: number;
    upcomingBookings: number;
  };
  recentActivity: Array<{
    id: string;
    type: 'call' | 'lead' | 'booking';
    title: string;
    description: string;
    timestamp: string;
    status: string | null;
    tenantId: string;
  }>;
};

const shellStyle: CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
  color: '#0f172a',
};

const containerStyle: CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: '32px 20px 56px',
};

const cardStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.88)',
  border: '1px solid rgba(148,163,184,0.22)',
  borderRadius: 20,
  boxShadow: '0 18px 45px rgba(15, 23, 42, 0.08)',
  backdropFilter: 'blur(10px)',
};

function formatRelativeTimestamp(value: string, referenceNow: number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';

  const diffMs = referenceNow - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 1) return 'Just now';
  if (Math.abs(diffMinutes) < 60) return `${Math.abs(diffMinutes)}m ${diffMinutes >= 0 ? 'ago' : 'from now'}`;

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) return `${Math.abs(diffHours)}h ${diffHours >= 0 ? 'ago' : 'from now'}`;

  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 7) return `${Math.abs(diffDays)}d ${diffDays >= 0 ? 'ago' : 'from now'}`;

  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function activityTone(type: DashboardSummary['recentActivity'][number]['type']) {
  if (type === 'call') return { bg: '#dbeafe', fg: '#1d4ed8', label: 'Call' };
  if (type === 'lead') return { bg: '#dcfce7', fg: '#15803d', label: 'Lead' };
  return { bg: '#fef3c7', fg: '#b45309', label: 'Booking' };
}

export default function DashboardHome() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [referenceNow] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    fetch('/api/dashboard/summary', { cache: 'no-store' })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok || !json.ok) {
          throw new Error(json.error || 'Failed to load dashboard');
        }
        if (active) {
          setSummary(json.data);
          setError(null);
        }
      })
      .catch((fetchError: unknown) => {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load dashboard');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const tenantLabel = useMemo(() => {
    if (!summary || summary.tenants.length === 0) return 'No tenant access yet';
    const namedTenants = summary.tenants.map((tenant) => tenant.tenantName).filter(Boolean) as string[];
    if (namedTenants.length === 0) return `${summary.membershipCount} tenant account${summary.membershipCount === 1 ? '' : 's'}`;
    if (namedTenants.length === 1) return namedTenants[0];
    return `${namedTenants[0]} +${namedTenants.length - 1} more`;
  }, [summary]);

  return (
    <main style={shellStyle}>
      <div style={containerStyle}>
        <section style={{ ...cardStyle, padding: 28 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
            <div style={{ maxWidth: 720 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4f46e5' }}>
                Dashboard overview
              </p>
              <h1 style={{ margin: '10px 0 8px', fontSize: 34, lineHeight: 1.1, fontWeight: 800 }}>
                Keep an eye on calls, leads, and bookings in one place.
              </h1>
              <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: '#475569' }}>
                Tenant scope: {tenantLabel}. Monthly totals are shown for calls, leads, and bookings, plus the next 7 days of upcoming bookings.
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <Link href="/dashboard/calls" style={{ padding: '10px 14px', borderRadius: 999, background: '#0f172a', color: '#fff', textDecoration: 'none', fontWeight: 600 }}>
                View calls
              </Link>
              <Link href="/dashboard/leads" style={{ padding: '10px 14px', borderRadius: 999, background: '#e2e8f0', color: '#0f172a', textDecoration: 'none', fontWeight: 600 }}>
                Leads
              </Link>
              <Link href="/dashboard/bookings" style={{ padding: '10px 14px', borderRadius: 999, background: '#e2e8f0', color: '#0f172a', textDecoration: 'none', fontWeight: 600 }}>
                Bookings
              </Link>
            </div>
          </div>
        </section>

        {error ? (
          <section style={{ ...cardStyle, marginTop: 20, padding: 20, borderColor: 'rgba(220,38,38,0.25)', color: '#b91c1c' }}>
            {error}
          </section>
        ) : null}

        <section style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {[
            { label: 'Calls this month', value: summary?.kpis.calls ?? '—', hint: 'All logged calls across your tenant access' },
            { label: 'Leads this month', value: summary?.kpis.leads ?? '—', hint: 'New enquiries captured this month' },
            { label: 'Bookings this month', value: summary?.kpis.bookings ?? '—', hint: 'Bookings created this month' },
            { label: 'Upcoming bookings', value: summary?.kpis.upcomingBookings ?? '—', hint: 'Scheduled in the next 7 days' },
          ].map((card) => (
            <article key={card.label} style={{ ...cardStyle, padding: 20 }}>
              <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>{card.label}</p>
              <div style={{ marginTop: 14, fontSize: 36, fontWeight: 800, letterSpacing: '-0.04em' }}>
                {loading ? '…' : card.value}
              </div>
              <p style={{ margin: '10px 0 0', color: '#475569', fontSize: 14, lineHeight: 1.5 }}>{card.hint}</p>
            </article>
          ))}
        </section>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 20, marginTop: 20 }}>
          <article style={{ ...cardStyle, padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 18 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Recent activity</h2>
                <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 14 }}>
                  Latest calls, leads, and bookings across the tenants you can access.
                </p>
              </div>
            </div>

            {loading ? (
              <p style={{ margin: 0, color: '#64748b' }}>Loading recent activity…</p>
            ) : summary?.recentActivity.length ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {summary.recentActivity.map((item) => {
                  const tone = activityTone(item.type);
                  return (
                    <div
                      key={`${item.type}-${item.id}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto 1fr auto',
                        gap: 14,
                        alignItems: 'start',
                        padding: 16,
                        borderRadius: 16,
                        border: '1px solid rgba(148,163,184,0.18)',
                        background: 'rgba(248,250,252,0.8)',
                      }}
                    >
                      <span style={{ background: tone.bg, color: tone.fg, borderRadius: 999, padding: '6px 10px', fontSize: 12, fontWeight: 700 }}>
                        {tone.label}
                      </span>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{item.title}</div>
                        <div style={{ marginTop: 4, color: '#475569', fontSize: 14, lineHeight: 1.5 }}>{item.description}</div>
                        {item.status ? (
                          <div style={{ marginTop: 8, color: '#64748b', fontSize: 13 }}>Status: {item.status}</div>
                        ) : null}
                      </div>
                      <div style={{ textAlign: 'right', color: '#64748b', fontSize: 13, whiteSpace: 'nowrap' }}>
                        {formatRelativeTimestamp(item.timestamp, referenceNow)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ margin: 0, color: '#64748b' }}>No activity yet for your tenant membership.</p>
            )}
          </article>

          <aside style={{ display: 'grid', gap: 20 }}>
            <article style={{ ...cardStyle, padding: 22 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Tenant access</h2>
              <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
                {loading ? (
                  <p style={{ margin: 0, color: '#64748b' }}>Loading tenant access…</p>
                ) : summary?.tenants.length ? (
                  summary.tenants.map((tenant) => (
                    <div key={tenant.tenantId} style={{ padding: 14, borderRadius: 14, background: '#f8fafc', border: '1px solid rgba(148,163,184,0.18)' }}>
                      <div style={{ fontWeight: 700 }}>{tenant.tenantName ?? 'Unnamed tenant'}</div>
                      <div style={{ marginTop: 4, fontSize: 13, color: '#64748b' }}>Role: {tenant.role}</div>
                    </div>
                  ))
                ) : (
                  <p style={{ margin: 0, color: '#64748b' }}>You are signed in, but no tenant memberships were found yet.</p>
                )}
              </div>
            </article>

            <article style={{ ...cardStyle, padding: 22 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Next actions</h2>
              <ul style={{ margin: '14px 0 0', paddingLeft: 18, color: '#475569', lineHeight: 1.7 }}>
                <li>Review fresh leads and follow up on anything urgent.</li>
                <li>Check upcoming bookings for capacity or reschedules.</li>
                <li>Use the detail pages when you need full record tables.</li>
              </ul>
            </article>
          </aside>
        </section>
      </div>
    </main>
  );
}
