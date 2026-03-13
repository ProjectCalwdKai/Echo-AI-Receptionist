'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '../../lib/supabase/client';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const next = '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Sign in</h1>
      <p style={{ opacity: 0.8, marginTop: 8 }}>Use your Supabase Auth email/password.</p>

      <form onSubmit={onSubmit} style={{ marginTop: 16, display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8 }} />
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Password</span>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8 }} />
        </label>

        {error ? <div style={{ color: 'crimson' }}>{error}</div> : null}

        <button disabled={loading} style={{ padding: 10, borderRadius: 8, background: '#111', color: '#fff' }}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
