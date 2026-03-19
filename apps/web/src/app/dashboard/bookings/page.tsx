'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Booking = {
  id: string;
  created_at: string;
  tenant_id: string;
  service_name: string | null;
  start_at: string;
  end_at: string;
  status: string;
  customer_phone: string | null;
  customer_name: string | null;
  customer_email: string | null;
  calendar_event_id: string | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function statusStyles(status: string) {
  const palette: Record<string, { background: string; color: string }> = {
    confirmed: { background: '#dbeafe', color: '#1d4ed8' },
    completed: { background: '#dcfce7', color: '#166534' },
    cancelled: { background: '#fee2e2', color: '#991b1b' },
    no_show: { background: '#fef3c7', color: '#92400e' },
  };

  return palette[status] ?? { background: '#f3f4f6', color: '#374151' };
}

export default function BookingsPage() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mountedAt] = useState(() => Date.now());

  useEffect(() => {
    fetch('/api/bookings')
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Failed');
        setRows(j.data);
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  const summary = useMemo(() => ({
    total: rows.length,
    upcoming: rows.filter((row) => new Date(row.start_at).getTime() > mountedAt).length,
    confirmed: rows.filter((row) => row.status === 'confirmed').length,
  }), [mountedAt, rows]);

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Bookings</h1>
          <p style={{ marginTop: 6, opacity: 0.72 }}>Upcoming appointments with quick access to customer context and status changes.</p>
        </div>
        <Link href="/dashboard" style={{ textDecoration: 'underline' }}>Back to dashboard</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
        {[
          ['Total bookings', String(summary.total)],
          ['Upcoming', String(summary.upcoming)],
          ['Confirmed', String(summary.confirmed)],
        ].map(([label, value]) => (
          <section key={label} style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 12, opacity: 0.72 }}>{label}</div>
            <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>{value}</div>
          </section>
        ))}
      </div>

      {error ? <p style={{ color: 'crimson', marginTop: 16 }}>{error}</p> : null}
      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['start', 'service', 'customer', 'status', 'calendar event', 'details'].map((h) => (
                <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px 6px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const badge = statusStyles(row.status);
              return (
                <tr key={row.id}>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px', whiteSpace: 'nowrap' }}>{formatDate(row.start_at)}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{row.service_name ?? '—'}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>
                    <div>{row.customer_name ?? 'Unknown customer'}</div>
                    <div style={{ opacity: 0.72, fontSize: 13 }}>{row.customer_phone ?? row.customer_email ?? 'No contact details'}</div>
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>
                    <span style={{ display: 'inline-flex', padding: '4px 8px', borderRadius: 999, background: badge.background, color: badge.color, fontSize: 12, fontWeight: 600 }}>
                      {row.status}
                    </span>
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px', fontFamily: 'monospace', fontSize: 12 }}>{row.calendar_event_id ?? '—'}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                    <Link href={`/dashboard/bookings/${row.id}`} style={{ textDecoration: 'underline' }}>Open</Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !error ? (
              <tr>
                <td colSpan={6} style={{ padding: 18, opacity: 0.7 }}>No bookings yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
