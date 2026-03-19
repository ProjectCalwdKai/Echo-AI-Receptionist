import { supabaseAdmin } from './supabaseAdmin';

export type MembershipTenant = {
  id: string;
  name: string;
  template_key: string;
  timezone: string;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type TenantMembership = {
  tenant_id: string;
  user_id: string;
  role: string;
  created_at: string;
  tenants: MembershipTenant | MembershipTenant[] | null;
};

export async function getUserTenantMemberships(userId: string) {
  return supabaseAdmin
    .from('tenant_users')
    .select(`
      tenant_id,
      user_id,
      role,
      created_at,
      tenants (
        id,
        name,
        template_key,
        timezone,
        currency,
        status,
        created_at,
        updated_at
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
}

export async function getTenantMembership(userId: string, tenantId: string) {
  return supabaseAdmin
    .from('tenant_users')
    .select('tenant_id, user_id, role, created_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
}

export function getMembershipTenant(membership: TenantMembership) {
  return Array.isArray(membership.tenants) ? membership.tenants[0] ?? null : membership.tenants;
}

export function isTenantAdminRole(role: string | null | undefined) {
  return role === 'owner' || role === 'admin';
}

export function isGlobalAdminEmail(email: string | null | undefined) {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || !email) return false;
  return email.trim().toLowerCase() === adminEmail;
}
