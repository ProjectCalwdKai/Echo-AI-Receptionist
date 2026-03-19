'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LEAD_STATUSES } from '@/lib/ops.constants';

type LeadDetail = {
  id: string;
  created_at: string;
  tenant_id: string;
  location_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  reason: string | null;
  urgency: string | null;
  preferred_time: string | null;
  details_json: unknown;
  status: string;
  tenants?: { name: string | null } | null;
  tenant_locations?: { name: string | null; address: string | null } | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState<string>('');
  const [record, setRecord] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingStatus, setSavingStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    params
      .then(async ({ id: resolvedId }) => {
        setId(resolvedId);
        const response = await fetch(`/api/leads/${resolvedId}`);
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
      const response = await fetch(`/api/leads/${id}`, {
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
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Lead detail</h1>
          <p style={{ marginTop: 6, opacity: 0.72 }}>Contact context, intake notes, and safe status changes.</p>
        </div>
        <Link href="/dashboard/leads" style={{ textDecoration: 'underline' }}>Back to leads</Link>
      </div>

      {error ? <p style={{ color: 'crimson', marginTop: 16 }}>{error}</p> : null}
      {!record && !error ? <p style={{ marginTop: 16, opacity: 0.72 }}>Loading…</p> : null}

      {record ? (
        <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
          <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>{record.name ?? 'Unknown caller'}</h2>
                <p style={{ marginTop: 6, opacity: 0.72 }}>{record.reason ?? 'No reason captured'}</p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {LEAD_STATUSES.map((status) => (
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
                ['Phone', record.phone ?? '—'],
                ['Email', record.email ?? '—'],
                ['Urgency', record.urgency ?? '—'],
                ['Preferred time', record.preferred_time ?? '—'],
                ['Status', record.status],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
                  <div style={{ marginTop: 4, wordBreak: 'break-word' }}>{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Structured intake payload</h2>
            <pre style={{ marginTop: 10, overflowX: 'auto', fontSize: 13, background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 10 }}>
              {JSON.stringify(record.details_json ?? null, null, 2)}
            </pre>
          </section>
        </div>
      ) : null}
    </main>
  );
}
