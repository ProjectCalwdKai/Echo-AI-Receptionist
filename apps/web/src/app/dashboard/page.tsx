import Link from 'next/link';

export default function DashboardHome() {
  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Echo AI Receptionist — Dashboard</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>Admin view (service-role). We’ll add tenant logins next.</p>

      <ul style={{ marginTop: 16, display: 'grid', gap: 8 }}>
        <li><Link href="/dashboard/calls">Calls</Link></li>
        <li><Link href="/dashboard/leads">Leads</Link></li>
        <li><Link href="/dashboard/bookings">Bookings</Link></li>
      </ul>
    </main>
  );
}
