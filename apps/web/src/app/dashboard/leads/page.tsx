'use client';

import { useEffect, useState } from 'react';

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

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Leads</h1>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['created_at','phone','name','reason','preferred_time','urgency','status','tenant_name'].map((h) => (
                <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px 6px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{new Date(r.created_at).toLocaleString()}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{r.phone}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{r.name}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{r.reason}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{r.preferred_time}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{r.urgency}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{r.status}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{r.tenants?.name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
