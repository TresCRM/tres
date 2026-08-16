'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { portalApi } from '@/lib/apiClient';
import { usePortalAuth } from '../_lib/usePortalAuth';

export default function PortalProfile() {
  const { token, isAuthed } = usePortalAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false);
      setError('Your portal session has ended. Please request a new magic link.');
      return;
    }
    portalApi.getCustomerProfile(token)
      .then(res => {
        const d = res.data.data;
        setName(d?.name || '');
        setEmail(d?.email || '');
        setPhone(d?.phone || '');
      })
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false));
  }, [isAuthed, token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isAuthed) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await portalApi.updateCustomerProfile(token, {
        name: name.trim(),
        phone: phone.trim(),
      });
      const d = res.data.data;
      setName(d?.name || '');
      setPhone(d?.phone || '');
      setSuccess('Profile updated.');
      setTimeout(() => setSuccess(''), 2500);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || 'Failed to save.';
      setError(msg.replace(/_/g, ' '));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 size={24} className="animate-spin mx-auto text-gray-400" />
        <p className="text-gray-500 mt-2">Loading profile…</p>
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-2">{error}</p>
        <Link href="/portal/login" className="text-sm text-[var(--brand-primary,#4F46E5)] hover:underline">
          Request a new access link
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">My Profile</h1>

      <form onSubmit={handleSubmit} className="border rounded-xl bg-white p-6 space-y-4 max-w-md" aria-busy={saving}>
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary,#4F46E5)]"
            required
            maxLength={120}
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            className="w-full border rounded-md px-3 py-2 text-sm bg-gray-50"
            disabled
            readOnly
          />
          <p className="text-xs text-gray-400 mt-1">Email is your stable identity and cannot be changed here.</p>
        </div>

        <div>
          <label htmlFor="phone" className="block text-sm font-medium mb-1">Phone</label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary,#4F46E5)]"
            maxLength={40}
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-700" role="status">
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
