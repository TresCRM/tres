'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/apiClient';
import { Lock, AlertCircle, CheckCircle2, Loader2, Eye, EyeOff } from 'lucide-react';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (newPw !== confirmPw) { setError('Passwords do not match.'); return; }
    if (newPw.length < 10) { setError('Password must be at least 10 characters.'); return; }
    if (!/[A-Z]/.test(newPw) || !/[a-z]/.test(newPw) || !/[0-9]/.test(newPw)) {
      setError('Password must contain uppercase, lowercase, and a digit.'); return;
    }
    setLoading(true);
    try {
      await authApi.changePassword({ currentPassword: currentPw, newPassword: newPw });
      router.push('/dashboard');
    } catch (err: any) {
      const code = err?.response?.data?.error;
      setError(code === 'bad_credentials' ? 'Current password is incorrect.' : 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary,#4F46E5)] focus:border-transparent';

  return (
    <div className="max-w-md mx-auto mt-8">
      <div className="text-center mb-6">
        <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Lock size={26} className="text-amber-600" />
        </div>
        <h1 className="text-xl font-bold">Password Expired</h1>
        <p className="text-sm text-gray-500 mt-1">Your password has expired. Please set a new password to continue.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2" role="alert">
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} value={currentPw} onChange={e => setCurrentPw(e.target.value)} className={inputClass} autoComplete="current-password" autoFocus />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
          <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className={inputClass} autoComplete="new-password" placeholder="Min 10 chars, uppercase, lowercase, digit" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
          <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className={inputClass} autoComplete="new-password" />
        </div>
        <button type="submit" disabled={loading || !currentPw || !newPw} className="w-full py-3 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-semibold text-sm hover:opacity-90 min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? <><Loader2 size={18} className="animate-spin" /> Changing...</> : 'Change Password & Continue'}
        </button>
      </form>
    </div>
  );
}
