'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';

export const dynamic = 'force-dynamic';

type FormState = {
  businessName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone: string;
};

type SubmitState =
  | { ok: false; error: string }
  | { ok: true; message: string };

const inputStyle: CSSProperties = {
  padding: 10,
  border: '1px solid #ddd',
  borderRadius: 8,
};

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    businessName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
  });
  const [submitState, setSubmitState] = useState<SubmitState | null>(null);
  const [loading, setLoading] = useState(false);

  const validationError = useMemo(() => {
    const businessName = form.businessName.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!businessName) return 'Business name is required.';
    if (!email) return 'Email is required.';
    if (!emailPattern.test(email)) return 'Enter a valid email address.';
    if (!form.password) return 'Password is required.';
    if (form.password.length < 8) return 'Password must be at least 8 characters.';
    if (!form.confirmPassword) return 'Please confirm your password.';
    if (form.password !== form.confirmPassword) return 'Passwords do not match.';
    if (phone && !/^[+\d()\-\s]{7,}$/.test(phone)) return 'Enter a valid phone number or leave it blank.';

    return null;
  }, [form]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (validationError) {
      setSubmitState({ ok: false, error: validationError });
      return;
    }

    setLoading(true);
    setSubmitState(null);

    try {
      const response = await fetch('/api/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name: form.businessName.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          phone: form.phone.trim() || null,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; message?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        setSubmitState({ ok: false, error: payload?.error ?? 'Something went wrong while creating your account.' });
        setLoading(false);
        return;
      }

      setSubmitState({
        ok: true,
        message: payload.message ?? 'Your business account is ready. Redirecting to sign in…',
      });

      window.setTimeout(() => {
        router.push('/login');
        router.refresh();
      }, 1400);
    } catch (error) {
      setSubmitState({
        ok: false,
        error: error instanceof Error ? error.message : 'Unable to reach the onboarding service.',
      });
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Sign up your business</h1>
      <p style={{ opacity: 0.8, marginTop: 8 }}>
        Create your account to start onboarding your reception setup.
      </p>

      <form onSubmit={onSubmit} style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Business name</span>
          <input
            value={form.businessName}
            onChange={(e) => updateField('businessName', e.target.value)}
            type="text"
            required
            autoComplete="organization"
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Email</span>
          <input
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            type="email"
            required
            autoComplete="email"
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Password</span>
          <input
            value={form.password}
            onChange={(e) => updateField('password', e.target.value)}
            type="password"
            required
            autoComplete="new-password"
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Confirm password</span>
          <input
            value={form.confirmPassword}
            onChange={(e) => updateField('confirmPassword', e.target.value)}
            type="password"
            required
            autoComplete="new-password"
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Phone (optional)</span>
          <input
            value={form.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            type="tel"
            autoComplete="tel"
            style={inputStyle}
          />
        </label>

        {submitState && !submitState.ok ? <div style={{ color: 'crimson' }}>{submitState.error}</div> : null}
        {submitState && submitState.ok ? <div style={{ color: 'green' }}>{submitState.message}</div> : null}

        <button
          disabled={loading || !!validationError}
          style={{
            padding: 10,
            borderRadius: 8,
            background: '#111',
            color: '#fff',
            opacity: loading || validationError ? 0.7 : 1,
            cursor: loading || validationError ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Creating account…' : 'Create business account'}
        </button>
      </form>

      <p style={{ marginTop: 16, opacity: 0.8 }}>
        Already have an account?{' '}
        <Link href="/login" style={{ textDecoration: 'underline' }}>
          Sign in
        </Link>
      </p>
    </main>
  );
}
