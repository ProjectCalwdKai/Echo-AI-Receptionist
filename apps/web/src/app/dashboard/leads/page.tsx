'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Lead = {
  id: string;
  created_at: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  reason: string | null;
  urgency: string | null;
  preferred_time: string | null;
  status: string;
  tenants?: {
    name: string | null;
  } | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function statusStyles(status: string) {
  const palette: Record<string, { background: string; color: string }> = {
    new: { background: '#eff6ff', color: '#1d4ed8' },
    contacted: { background: '#fef3c7', color: '#92400e' },
    qualified: { background: '#ede9fe', color: '#6d28d9' },
    won: { background: '#dcfce7', color: '#166534' },
    lost: { background: '#fee2e2', color: '#991b1b' },
  };

  return palette[status] ?? { background: '#f3f4f6', color: '#374151' };
}

export default function LeadsPage() {
  const [rows, setRows] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/leads')
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Failed');
        setRows(j.data);
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  const summary = useMemo(() => ({
    total: rows.length,
    fresh: rows.filter((row) => row.status === 'new').length,
    active: rows.filter((row) => ['contacted', 'qualified'].includes(row.status)).length,
  }), [rows]);

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Leads</h1>
          <p style={{ marginTop: 6, opacity: 0.72 }}>Pipeline view with owner-safe status updates on each lead record.</p>
        </div>
        <Link href="/dashboard" style={{ textDecoration: 'underline' }}>Back to dashboard</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
        {[
          ['Total leads', String(summary.total)],
          ['New', String(summary.fresh)],
          ['In progress', String(summary.active)],
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
              {['created', 'contact', 'reason', 'preferred time', 'urgency', 'status', 'tenant', 'details'].map((h) => (
                <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px 6px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const badge = statusStyles(row.status);
              return (
                <tr key={row.id}>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px', whiteSpace: 'nowrap' }}>{formatDate(row.created_at)}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>
                    <div>{row.name ?? 'Unknown caller'}</div>
                    <div style={{ opacity: 0.72, fontSize: 13 }}>{row.phone ?? row.email ?? 'No contact details'}</div>
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{row.reason ?? '—'}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{row.preferred_time ?? '—'}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{row.urgency ?? '—'}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>
                    <span style={{ display: 'inline-flex', padding: '4px 8px', borderRadius: 999, background: badge.background, color: badge.color, fontSize: 12, fontWeight: 600 }}>
                      {row.status}
                    </span>
                  </td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{row.tenants?.name ?? '—'}</td>
                  <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                    <Link href={`/dashboard/leads/${row.id}`} style={{ textDecoration: 'underline' }}>Open</Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !error ? (
              <tr>
                <td colSpan={8} style={{ padding: 18, opacity: 0.7 }}>No leads yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
