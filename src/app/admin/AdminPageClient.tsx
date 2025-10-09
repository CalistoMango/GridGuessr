"use client";

import { FormEvent, useEffect, useState } from 'react';
import AdminPanel from './AdminPanel';

type AdminCredential = {
  fid?: number;
  password?: string;
};

/**
 * Client wrapper that manages admin authentication UX before handing
 * control to the main `AdminPanel`. Keeps the page component server-only
 * so Next.js type generation stays stable while this component handles
 * browser state and effects.
 */
export function AdminPageClient() {
  const [authenticated, setAuthenticated] = useState(false);
  const [credential, setCredential] = useState<AdminCredential | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const persistCredential = (value: AdminCredential) => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem('gridguessr_admin_session', JSON.stringify(value));
    } catch (storageError) {
      console.error('Failed to persist admin session', storageError);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const authenticate = async (payload: AdminCredential): Promise<boolean> => {
      try {
        const response = await fetch('/api/admin/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          await response.json().catch(() => null);
          return false;
        }

        const data = await response.json();
        if (!data?.authenticated) {
          return false;
        }

        if (!cancelled) {
          const sanitized: AdminCredential = {
            ...(typeof payload.fid === 'number' ? { fid: payload.fid } : {}),
            ...(payload.password ? { password: payload.password } : {})
          };
          persistCredential(sanitized);
          setAuthenticated(true);
          setCredential(sanitized);
        }

        return true;
      } catch (err) {
        if (!cancelled) {
          console.error('Admin auth check failed:', err);
        }
        return false;
      }
    };

    const resolveAuth = async () => {
      let success = false;

      try {
        if (typeof window !== 'undefined') {
          const sessionValue = sessionStorage.getItem('gridguessr_admin_session');
          if (sessionValue) {
            try {
              const stored = JSON.parse(sessionValue) as AdminCredential | null;
              if (stored?.fid || stored?.password) {
                success = await authenticate(stored);
              }
              if (!success) {
                sessionStorage.removeItem('gridguessr_admin_session');
              }
            } catch (parseError) {
              console.error('Failed to read admin session from storage', parseError);
              sessionStorage.removeItem('gridguessr_admin_session');
            }
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    resolveAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  const handlePasswordLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await response.json();

      if (response.ok && data.authenticated) {
        const stored: AdminCredential = { password };
        persistCredential(stored);
        setAuthenticated(true);
        setCredential(stored);
        setPassword('');
      } else {
        setError('Invalid password');
      }
    } catch {
      setError('Authentication failed');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!authenticated || !credential) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
        <div className="bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full">
          <h1 className="text-2xl font-bold text-white mb-2">GridGuessr Admin</h1>
          <p className="text-gray-400 text-sm mb-6">
            Enter admin password to continue
          </p>

          <form onSubmit={handlePasswordLogin}>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Admin password"
              className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-red-500"
              autoFocus
            />

            {error && (
              <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-2 rounded-lg mb-4 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors"
              disabled={!password.trim()}
            >
              Login
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-700">
            <p className="text-gray-500 text-xs text-center">
              Admin access via Farcaster FID is also supported
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <AdminPanel authCredential={credential} />;
}
