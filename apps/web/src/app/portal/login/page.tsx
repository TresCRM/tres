'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail } from 'lucide-react';
import { portalApi } from '@/lib/apiClient';

export default function PortalLoginPage() {
  const [email, setEmail] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await portalApi.requestPortalAccess({
        email: email.trim().toLowerCase(),
        tenantSlug: tenantSlug.trim().toLowerCase(),
      });
      setSent(true);
    } catch {
      // Always show success to prevent email enumeration (API returns 200 regardless)
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-white rounded-xl shadow-sm border p-8">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail size={24} className="text-green-600" />
            </div>
            <h1 className="text-xl font-bold mb-2">Check Your Email</h1>
            <p className="text-gray-500 mb-4">
              If an account exists for <strong>{email}</strong>, we&apos;ve sent a magic link to access your support portal.
            </p>
            <p className="text-sm text-gray-400">The link expires in 7 days.</p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              className="mt-6 text-sm text-[var(--brand-primary,#4F46E5)] hover:underline"
            >
              Try a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Support Portal</h1>
          <p className="text-gray-500 mt-1">Enter your email to access your tickets</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
          <div>
            <label htmlFor="tenantSlug" className="block text-sm font-medium mb-1">Organization</label>
            <input
              id="tenantSlug"
              type="text"
              required
              value={tenantSlug}
              onChange={e => setTenantSlug(e.target.value)}
              className="w-full border rounded-md px-3 py-2.5 text-sm"
              placeholder="your-company"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">Email Address</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full border rounded-md px-3 py-2.5 text-sm"
              placeholder="you@example.com"
            />
          </div>

          {error && <p className="text-red-500 text-sm" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm min-h-[44px]"
          >
            {loading ? <><Loader2 size={16} className="animate-spin" /> Sending...</> : 'Send Magic Link'}
          </button>

          <p className="text-center text-xs text-gray-400">
            We&apos;ll email you a secure link to view your tickets.
          </p>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          <Link href="/" className="hover:underline">Back to main site</Link>
        </p>
      </div>
    </div>
  );
}
