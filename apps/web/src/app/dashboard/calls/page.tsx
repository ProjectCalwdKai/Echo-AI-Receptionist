'use client';

import { useEffect, useState } from 'react';

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
};

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

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Calls</h1>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['created_at','vapi_call_id','intent','outcome','tenant_id'].map((h) => (
                <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px 6px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{new Date(r.created_at).toLocaleString()}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px', fontFamily: 'monospace', fontSize: 12 }}>{r.vapi_call_id}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{r.intent}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{r.outcome}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px', fontFamily: 'monospace', fontSize: 12 }}>{r.tenant_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
