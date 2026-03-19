import { supabaseAdmin } from './supabaseAdmin';

export type MembershipVapiAssistant = {
  tenant_id: string;
  vapi_assistant_id: string;
  name: string | null;
  last_published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MembershipTenant = {
  id: string;
  name: string;
  template_key: string;
  timezone: string;
  currency: string;
  status: string;
  created_at: string;
  updated_at: string;
  vapi_assistants?: MembershipVapiAssistant | MembershipVapiAssistant[] | null;
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
        updated_at,
        vapi_assistants (
          tenant_id,
          vapi_assistant_id,
          name,
          last_published_at,
          created_at,
          updated_at
        )
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

export function getMembershipVapiAssistant(membership: TenantMembership) {
  const tenant = getMembershipTenant(membership);
  const assistant = tenant?.vapi_assistants;
  return Array.isArray(assistant) ? assistant[0] ?? null : assistant ?? null;
}

export function isTenantAdminRole(role: string | null | undefined) {
  return role === 'owner' || role === 'admin';
}

export function isGlobalAdminEmail(email: string | null | undefined) {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail || !email) return false;
  return email.trim().toLowerCase() === adminEmail;
}
