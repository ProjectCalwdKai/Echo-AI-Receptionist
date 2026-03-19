'use client';

import { useEffect, useMemo, useState } from 'react';

type MembershipTenant = {
  id: string;
  name: string;
  template_key: string;
  timezone: string;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type Membership = {
  tenant_id: string;
  user_id: string;
  role: string;
  created_at: string;
  tenants: MembershipTenant | MembershipTenant[] | null;
};

type MembershipResponse = {
  ok: boolean;
  error?: string;
  data: Membership[];
  user?: {
    id: string;
    email: string | null;
  };
};

type AdminInfoResponse = {
  ok: boolean;
  error?: string;
  adminEmailConfigured?: boolean;
  isGlobalAdmin?: boolean;
  memberships?: Membership[];
};

function getTenant(membership: Membership) {
  return Array.isArray(membership.tenants) ? membership.tenants[0] ?? null : membership.tenants;
}

export default function TenantMembershipsPage() {
  const [rows, setRows] = useState<Membership[]>([]);
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [role, setRole] = useState('viewer');
  const [submitting, setSubmitting] = useState(false);
  const [adminInfo, setAdminInfo] = useState<AdminInfoResponse | null>(null);

  async function loadMemberships() {
    setError(null);

    const response = await fetch('/api/tenant-memberships');
    const json = (await response.json()) as MembershipResponse;

    if (!json.ok) {
      throw new Error(json.error || 'Failed to load memberships');
    }

    setRows(json.data ?? []);
    setUser(json.user ?? null);
  }

  async function loadAdminInfo() {
    const response = await fetch('/api/admin/bootstrap-tenant-user');
    const json = (await response.json()) as AdminInfoResponse;
    setAdminInfo(json);
  }

  useEffect(() => {
    loadMemberships().catch((e) => setError(String(e.message || e)));
    loadAdminInfo().catch(() => setAdminInfo(null));
  }, []);

  const canShowBootstrapForm = useMemo(() => {
    if (!adminInfo?.ok) return false;
    if (adminInfo.isGlobalAdmin) return true;

    return (adminInfo.memberships ?? []).some((membership) => membership.role === 'owner' || membership.role === 'admin');
  }, [adminInfo]);

  async function onBootstrapSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setAdminError(null);
    setAdminSuccess(null);

    try {
      const response = await fetch('/api/admin/bootstrap-tenant-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          role,
          targetUserId: targetUserId.trim() || undefined,
        }),
      });

      const json = await response.json();
      if (!json.ok) {
        throw new Error(json.error || 'Failed to update membership');
      }

      setAdminSuccess(`Access saved for user ${json.userId} on ${json.tenantName ?? json.tenantId} as ${json.role}.`);
      setTargetUserId('');
      await Promise.all([loadMemberships(), loadAdminInfo()]);
    } catch (e) {
      setAdminError(String((e as Error).message || e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ padding: 24, display: 'grid', gap: 24 }}>
      <section>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>Tenant access</h1>
        <p style={{ marginTop: 8, opacity: 0.8, maxWidth: 760 }}>
          See which tenants your account can access and what role you hold in each workspace.
        </p>
        {user ? (
          <p style={{ marginTop: 12, fontSize: 14, opacity: 0.75 }}>
            Signed in as <strong>{user.email ?? 'unknown user'}</strong>
            <br />
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{user.id}</span>
          </p>
        ) : null}
        {error ? <p style={{ color: 'crimson', marginTop: 12 }}>{error}</p> : null}
      </section>

      <section style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['tenant', 'role', 'status', 'template', 'timezone', 'currency', 'tenant_id'].map((heading) => (
                <th key={heading} style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px 6px' }}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '14px 6px', opacity: 0.7 }}>
                  No tenant memberships found for this user.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const tenant = getTenant(row);

                return (
                  <tr key={`${row.tenant_id}:${row.user_id}`}>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{tenant?.name ?? '—'}</td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{row.role}</td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{tenant?.status ?? '—'}</td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{tenant?.template_key ?? '—'}</td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{tenant?.timezone ?? '—'}</td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px' }}>{tenant?.currency ?? '—'}</td>
                    <td style={{ borderBottom: '1px solid #f0f0f0', padding: '8px 6px', fontFamily: 'monospace', fontSize: 12 }}>
                      {row.tenant_id}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {canShowBootstrapForm ? (
        <section style={{ maxWidth: 680 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Bootstrap or grant tenant access</h2>
          <p style={{ marginTop: 8, opacity: 0.8 }}>
            Use this to add a user to a tenant. Leave target user ID blank to grant the current signed-in account access.
          </p>

          <form onSubmit={onBootstrapSubmit} style={{ marginTop: 16, display: 'grid', gap: 12 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Tenant ID</span>
              <input
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
                required
                placeholder="00000000-0000-0000-0000-000000000000"
                style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8 }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span>Target user ID (optional)</span>
              <input
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                placeholder={user?.id ?? 'Defaults to your current user'}
                style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8, fontFamily: 'monospace' }}
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span>Role</span>
              <select value={role} onChange={(e) => setRole(e.target.value)} style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8 }}>
                <option value="viewer">viewer</option>
                <option value="admin">admin</option>
                <option value="owner">owner</option>
              </select>
            </label>

            {adminError ? <div style={{ color: 'crimson' }}>{adminError}</div> : null}
            {adminSuccess ? <div style={{ color: 'green' }}>{adminSuccess}</div> : null}

            <button disabled={submitting} style={{ padding: 10, borderRadius: 8, background: '#111', color: '#fff', width: 'fit-content' }}>
              {submitting ? 'Saving…' : 'Save membership'}
            </button>
          </form>
        </section>
      ) : (
        <section>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>Bootstrap or grant tenant access</h2>
          <p style={{ marginTop: 8, opacity: 0.8, maxWidth: 720 }}>
            This action is only available to the configured global admin email or existing tenant owners/admins.
          </p>
        </section>
      )}
    </main>
  );
}
