'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Call = {
  id: string;
  created_at: string;
  tenant_id: string;
  vapi_call_id: string;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  intent: string | null;
  outcome: string | null;
  summary: string | null;
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatDuration(value: number | null) {
  if (value === null) return '—';
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}m ${seconds}s`;
}

export default function CallsPage() {
  const [rows, setRows] = useState<Call[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/calls')
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Failed');
        setRows(j.data);
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  const summary = useMemo(() => {
    const connected = rows.filter((row) => row.started_at).length;
    const withOutcome = rows.filter((row) => row.outcome).length;
    return { total: rows.length, connected, withOutcome };
  }, [rows]);

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Calls</h1>
          <p style={{ marginTop: 6, opacity: 0.72 }}>Recent call traffic with quick drill-in for transcript and summary context.</p>
        </div>
        <Link href="/dashboard" style={{ textDecoration: 'underline' }}>Back to dashboard</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
        {[
          ['Total calls', String(summary.total)],
          ['Connected', String(summary.connected)],
          ['With outcome', String(summary.withOutcome)],
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
              {['created', 'intent', 'outcome', 'duration', 'summary', 'details'].map((h) => (
                <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px 6px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px', whiteSpace: 'nowrap' }}>{formatDate(row.created_at)}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{row.intent ?? '—'}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{row.outcome ?? '—'}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px', whiteSpace: 'nowrap' }}>{formatDuration(row.duration_sec)}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px', maxWidth: 380 }}>
                  <div style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {row.summary ?? 'No summary captured'}
                  </div>
                </td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px', whiteSpace: 'nowrap' }}>
                  <Link href={`/dashboard/calls/${row.id}`} style={{ textDecoration: 'underline' }}>Open</Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && !error ? (
              <tr>
                <td colSpan={6} style={{ padding: 18, opacity: 0.7 }}>No calls yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
