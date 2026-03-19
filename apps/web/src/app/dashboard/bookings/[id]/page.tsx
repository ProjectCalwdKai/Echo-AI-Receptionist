'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BOOKING_STATUSES } from '@/lib/ops.constants';

type BookingDetail = {
  id: string;
  created_at: string;
  tenant_id: string;
  location_id: string | null;
  start_at: string;
  end_at: string;
  calendar_provider: string | null;
  calendar_id: string | null;
  calendar_event_id: string | null;
  customer_json: unknown;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  service_name: string | null;
  notes: string | null;
  status: string;
  tenants?: { name: string | null } | null;
  tenant_locations?: { name: string | null; address: string | null } | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string>('');
  const [record, setRecord] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    params
      .then(async ({ id: resolvedId }) => {
        setId(resolvedId);
        const response = await fetch(`/api/bookings/${resolvedId}`);
        const json = await response.json();
        if (!json.ok) throw new Error(json.error || 'Failed');
        if (!cancelled) setRecord(json.data);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message || e));
      });

    return () => {
      cancelled = true;
    };
  }, [params]);

  async function updateStatus(status: string) {
    if (!id) return;
    setSavingStatus(status);
    setError(null);

    try {
      const response = await fetch(`/api/bookings/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await response.json();
      if (!json.ok) throw new Error(json.error || 'Failed');
      setRecord((current) => (current ? { ...current, status: json.data.status } : current));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setSavingStatus(null);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Booking detail</h1>
          <p style={{ marginTop: 6, opacity: 0.72 }}>Appointment context with lightweight operational status actions.</p>
        </div>
        <Link href="/dashboard/bookings" style={{ textDecoration: 'underline' }}>Back to bookings</Link>
      </div>

      {error ? <p style={{ color: 'crimson', marginTop: 16 }}>{error}</p> : null}
      {!record && !error ? <p style={{ marginTop: 16, opacity: 0.72 }}>Loading…</p> : null}

      {record ? (
        <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
          <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>{record.service_name ?? 'Untitled booking'}</h2>
                <p style={{ marginTop: 6, opacity: 0.72 }}>{formatDate(record.start_at)} → {formatDate(record.end_at)}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {BOOKING_STATUSES.map((status) => (
                  <button
                    key={status}
                    onClick={() => updateStatus(status)}
                    disabled={savingStatus !== null || record.status === status}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 999,
                      border: '1px solid #d1d5db',
                      background: record.status === status ? '#111827' : '#fff',
                      color: record.status === status ? '#fff' : '#111827',
                      opacity: savingStatus && savingStatus !== status ? 0.6 : 1,
                    }}
                  >
                    {savingStatus === status ? 'Saving…' : status}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {[
                ['Tenant', record.tenants?.name ?? record.tenant_id],
                ['Location', record.tenant_locations?.name ?? '—'],
                ['Address', record.tenant_locations?.address ?? '—'],
                ['Created', formatDate(record.created_at)],
                ['Customer', record.customer_name ?? '—'],
                ['Phone', record.customer_phone ?? '—'],
                ['Email', record.customer_email ?? '—'],
                ['Status', record.status],
                ['Calendar provider', record.calendar_provider ?? '—'],
                ['Calendar ID', record.calendar_id ?? '—'],
                ['Calendar event ID', record.calendar_event_id ?? '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
                  <div style={{ marginTop: 4, wordBreak: 'break-word', fontFamily: label.includes('ID') ? 'monospace' : 'inherit' }}>{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Notes</h2>
            <p style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{record.notes ?? 'No notes captured for this booking.'}</p>
          </section>

          <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Customer payload</h2>
            <pre style={{ marginTop: 10, overflowX: 'auto', fontSize: 13, background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 10 }}>
              {JSON.stringify(record.customer_json ?? null, null, 2)}
            </pre>
          </section>
        </div>
      ) : null}
    </main>
  );
}
