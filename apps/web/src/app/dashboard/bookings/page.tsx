'use client';

import { useEffect, useState } from 'react';

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
  calendar_event_id: string | null;
};

export default function BookingsPage() {
  const [rows, setRows] = useState<Booking[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/bookings')
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || 'Failed');
        setRows(j.data);
      })
      .catch((e) => setError(String(e.message || e)));
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Bookings</h1>
      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}
      <div style={{ overflowX: 'auto', marginTop: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['start_at','service_name','customer_phone','status','calendar_event_id','tenant_id'].map((h) => (
                <th key={h} style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px 6px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{new Date(r.start_at).toLocaleString()}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{r.service_name}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{r.customer_phone}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{r.status}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px', fontFamily: 'monospace', fontSize: 12 }}>{r.calendar_event_id}</td>
                <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px', fontFamily: 'monospace', fontSize: 12 }}>{r.tenant_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
