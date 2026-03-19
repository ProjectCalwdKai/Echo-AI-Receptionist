'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type CallDetail = {
  id: string;
  created_at: string;
  tenant_id: string;
  vapi_call_id: string;
  vapi_assistant_id: string | null;
  vapi_phone_number_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_sec: number | null;
  intent: string | null;
  outcome: string | null;
  transcript: unknown;
  summary: string | null;
  recording_url: string | null;
  tenants?: { name: string | null } | null;
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

export default function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [record, setRecord] = useState<CallDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    params
      .then(({ id }) => fetch(`/api/calls/${id}`))
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Failed');
        if (!cancelled) setRecord(j.data);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e.message || e));
      });

    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <main style={{ padding: 24, maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>Call detail</h1>
          <p style={{ marginTop: 6, opacity: 0.72 }}>Call metadata plus transcript/summary when Vapi captured them.</p>
        </div>
        <Link href="/dashboard/calls" style={{ textDecoration: 'underline' }}>Back to calls</Link>
      </div>

      {error ? <p style={{ color: 'crimson', marginTop: 16 }}>{error}</p> : null}
      {!record && !error ? <p style={{ marginTop: 16, opacity: 0.72 }}>Loading…</p> : null}

      {record ? (
        <div style={{ display: 'grid', gap: 16, marginTop: 20 }}>
          <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {[
                ['Tenant', record.tenants?.name ?? record.tenant_id],
                ['Created', formatDate(record.created_at)],
                ['Started', formatDate(record.started_at)],
                ['Ended', formatDate(record.ended_at)],
                ['Duration', formatDuration(record.duration_sec)],
                ['Intent', record.intent ?? '—'],
                ['Outcome', record.outcome ?? '—'],
                ['Vapi call ID', record.vapi_call_id],
                ['Assistant ID', record.vapi_assistant_id ?? '—'],
                ['Phone number ID', record.vapi_phone_number_id ?? '—'],
              ].map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
                  <div style={{ marginTop: 4, wordBreak: 'break-word', fontFamily: label.includes('ID') ? 'monospace' : 'inherit' }}>{value}</div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Summary</h2>
            <p style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{record.summary ?? 'No summary captured for this call.'}</p>
            {record.recording_url ? (
              <p style={{ marginTop: 12 }}>
                <a href={record.recording_url} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>
                  Open recording
                </a>
              </p>
            ) : null}
          </section>

          <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700 }}>Transcript payload</h2>
            <pre style={{ marginTop: 10, overflowX: 'auto', fontSize: 13, background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 10 }}>
              {JSON.stringify(record.transcript ?? null, null, 2)}
            </pre>
          </section>
        </div>
      ) : null}
    </main>
  );
}
