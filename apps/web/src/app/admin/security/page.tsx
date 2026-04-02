'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { mfaApi, authApi } from '@/lib/apiClient';
import { useAuthStore } from '@/stores/authStore';
import {
  ShieldCheck, ShieldOff, QrCode, Copy, Download, Loader2,
  AlertCircle, CheckCircle2, Eye, EyeOff, Lock, AlertTriangle,
  ShieldAlert, Clock, Monitor,
} from 'lucide-react';

type Step = 'status' | 'setup' | 'verify' | 'recovery' | 'disable' | 'change-password';

export default function AdminSecurityPage() {
  const params = useSearchParams();
  const setupRequired = params.get('setup') === 'required';
  const { user } = useAuthStore();
  const [step, setStep] = useState<Step>('status');
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // MFA setup state
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  // Password change state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);

  useEffect(() => {
    mfaApi.status()
      .then(r => { setMfaEnabled(r.data.mfaEnabled); setLoading(false); })
      .catch(() => setLoading(false));
    loadSessions();
  }, []);

  async function loadSessions() {
    setSessionsLoading(true);
    try {
      const res = await authApi.sessions();
      setSessions(res.data.sessions || []);
    } catch {}
    setSessionsLoading(false);
  }

  async function handleSetup() {
    setError('');
    setLoading(true);
    try {
      const res = await mfaApi.setup();
      setQrCode(res.data.qrCode);
      setSecret(res.data.secret);
      setStep('setup');
    } catch (err: any) {
      setError(err?.response?.data?.error === 'mfa_already_enabled' ? 'MFA is already enabled.' : 'Failed to start MFA setup.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    setError('');
    if (code.length < 6) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setLoading(true);
    try {
      const res = await mfaApi.verify(code);
      setRecoveryCodes(res.data.recoveryCodes);
      setMfaEnabled(true);
      setStep('recovery');
    } catch {
      setError('Invalid code. Make sure you scanned the QR code and entered the current code.');
    } finally {
      setLoading(false);
      setCode('');
    }
  }

  async function handleDisable() {
    setError('');
    if (!code.trim()) { setError('Enter your authenticator code or a recovery code.'); return; }
    setLoading(true);
    try {
      await mfaApi.disable(code);
      setMfaEnabled(false);
      setStep('status');
      setSuccess('Two-factor authentication has been disabled.');
    } catch {
      setError('Invalid code.');
    } finally {
      setLoading(false);
      setCode('');
    }
  }

  async function handleChangePassword() {
    setError('');
    if (newPw !== confirmPw) { setError('Passwords do not match.'); return; }
    if (newPw.length < 10) { setError('Password must be at least 10 characters.'); return; }
    if (!/[A-Z]/.test(newPw) || !/[a-z]/.test(newPw) || !/[0-9]/.test(newPw)) {
      setError('Password must contain uppercase, lowercase, and a digit.'); return;
    }
    setLoading(true);
    try {
      await authApi.changePassword({ currentPassword: currentPw, newPassword: newPw });
      setSuccess('Password changed successfully.');
      setStep('status');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err: any) {
      const code = err?.response?.data?.error;
      setError(code === 'bad_credentials' ? 'Current password is incorrect.' : 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRevokeSession(id: string) {
    try {
      await authApi.revokeSession(id);
      setSessions(prev => prev.filter(s => s._id !== id));
      setSuccess('Session revoked.');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to revoke session.');
    }
  }

  async function handleRevokeAll() {
    try {
      await authApi.revokeAllSessions();
      setSessions([]);
      setSuccess('All other sessions revoked.');
      setTimeout(() => setSuccess(''), 3000);
    } catch {
      setError('Failed to revoke sessions.');
    }
  }

  function downloadRecoveryCodes() {
    const text = `TRES CRM Admin Recovery Codes\nGenerated: ${new Date().toISOString()}\nAccount: ${user?.email || 'admin'}\n\n${recoveryCodes.join('\n')}\n\nStore these codes in a safe place. Each code can only be used once.`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'tres-crm-admin-recovery-codes.txt'; a.click();
    URL.revokeObjectURL(url);
  }

  function copyRecoveryCodes() {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setSuccess('Recovery codes copied to clipboard.');
    setTimeout(() => setSuccess(''), 3000);
  }

  const inputClass = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent';

  if (loading && step === 'status') {
    return <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold mb-1">Admin Security</h1>
      <p className="text-gray-500 text-sm mb-6">Manage authentication, sessions, and security settings for your admin account.</p>

      {/* MFA required banner */}
      {setupRequired && !mfaEnabled && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <ShieldAlert size={18} className="text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">MFA Required for Admin Access</p>
            <p className="text-xs text-red-600 mt-0.5">All admin accounts must have two-factor authentication enabled. You cannot access admin features until MFA is set up.</p>
          </div>
        </div>
      )}

      {/* MFA not enabled warning (always show, not just when redirected) */}
      {!setupRequired && !mfaEnabled && step === 'status' && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">Two-Factor Authentication Not Enabled</p>
            <p className="text-xs text-amber-600 mt-0.5">MFA is mandatory for admin accounts. Enable it now to maintain access.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2" role="alert">
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
          <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" />
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      {/* ── STATUS ── */}
      {step === 'status' && (
        <div className="space-y-6">
          {/* 2FA Card */}
          <div className="bg-white border rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {mfaEnabled ? <ShieldCheck size={24} className="text-emerald-600" /> : <ShieldOff size={24} className="text-red-400" />}
                <div>
                  <h2 className="font-semibold">Two-Factor Authentication</h2>
                  <p className="text-sm text-gray-500">{mfaEnabled ? 'Your admin account is protected with 2FA.' : 'Required for admin access. Enable now.'}</p>
                </div>
              </div>
              {mfaEnabled ? (
                <button onClick={() => { setStep('disable'); setError(''); setCode(''); }} className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors min-h-[44px]">
                  Disable
                </button>
              ) : (
                <button onClick={handleSetup} disabled={loading} className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 min-h-[44px]">
                  {loading ? 'Setting up...' : 'Enable 2FA'}
                </button>
              )}
            </div>
          </div>

          {/* Password Card */}
          <div className="bg-white border rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Lock size={24} className="text-gray-500" />
                <div>
                  <h2 className="font-semibold">Password</h2>
                  <p className="text-sm text-gray-500">Change your admin password. Must be 10+ chars with mixed case and digits.</p>
                </div>
              </div>
              <button onClick={() => { setStep('change-password'); setError(''); setSuccess(''); }} className="px-4 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px]">
                Change Password
              </button>
            </div>
          </div>

          {/* Active Sessions Card */}
          <div className="bg-white border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Monitor size={24} className="text-gray-500" />
                <div>
                  <h2 className="font-semibold">Active Sessions</h2>
                  <p className="text-sm text-gray-500">Monitor and manage your admin login sessions.</p>
                </div>
              </div>
              {sessions.length > 1 && (
                <button onClick={handleRevokeAll} className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors min-h-[44px]">
                  Revoke All Others
                </button>
              )}
            </div>
            {sessionsLoading ? (
              <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No active sessions found.</p>
            ) : (
              <div className="space-y-2">
                {sessions.map((s: any) => (
                  <div key={s._id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <Monitor size={16} className="text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-gray-700 truncate">{s.deviceInfo || 'Unknown device'}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span>{s.ip || 'Unknown IP'}</span>
                          <Clock size={10} />
                          <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeSession(s._id)}
                      className="text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors min-h-[32px] shrink-0"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Security Tips */}
          <div className="bg-gray-50 border rounded-xl p-6">
            <h2 className="font-semibold text-sm mb-3 flex items-center gap-2"><ShieldAlert size={16} className="text-gray-500" /> Admin Security Best Practices</h2>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2"><span className="text-red-500 font-bold shrink-0">1.</span> Always keep MFA enabled. Admin accounts without MFA are blocked from all operations.</li>
              <li className="flex items-start gap-2"><span className="text-red-500 font-bold shrink-0">2.</span> Use a unique, strong password not shared with any other service.</li>
              <li className="flex items-start gap-2"><span className="text-red-500 font-bold shrink-0">3.</span> Review active sessions regularly. Revoke any session you don&apos;t recognize.</li>
              <li className="flex items-start gap-2"><span className="text-red-500 font-bold shrink-0">4.</span> Store recovery codes offline in a secure location (password manager or safe).</li>
              <li className="flex items-start gap-2"><span className="text-red-500 font-bold shrink-0">5.</span> All admin actions are audit-logged. Unusual activity triggers security alerts.</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── SETUP (QR Code) ── */}
      {step === 'setup' && (
        <div className="bg-white border rounded-xl p-6 space-y-6">
          <div className="text-center">
            <QrCode size={24} className="mx-auto text-gray-500 mb-2" />
            <h2 className="font-semibold text-lg">Scan QR Code</h2>
            <p className="text-sm text-gray-500 mt-1">Scan this code with your authenticator app (Google Authenticator, Authy, 1Password, etc.)</p>
          </div>

          <div className="flex justify-center">
            {qrCode && <img src={qrCode} alt="MFA QR Code" className="w-52 h-52 rounded-lg border" />}
          </div>

          <div className="text-center">
            <p className="text-xs text-gray-400 mb-1">Or enter this key manually:</p>
            <code className="text-sm bg-gray-100 px-3 py-1.5 rounded font-mono select-all">{secret}</code>
          </div>

          <div>
            <label htmlFor="mfa-code" className="block text-sm font-medium text-gray-700 mb-1.5">Enter the 6-digit code to verify</label>
            <input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-2xl tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep('status')} className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50 min-h-[44px]">Cancel</button>
            <button onClick={handleVerify} disabled={loading || code.length < 6} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]">
              {loading ? <Loader2 size={16} className="animate-spin" /> : null} Verify & Enable
            </button>
          </div>
        </div>
      )}

      {/* ── RECOVERY CODES ── */}
      {step === 'recovery' && (
        <div className="bg-white border rounded-xl p-6 space-y-6">
          <div className="text-center">
            <CheckCircle2 size={28} className="mx-auto text-emerald-600 mb-2" />
            <h2 className="font-semibold text-lg">2FA Enabled Successfully</h2>
            <p className="text-sm text-gray-500 mt-1">Save these recovery codes in a safe place. Each code can only be used once if you lose access to your authenticator.</p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <p className="text-xs text-red-700 font-medium">These codes will NOT be shown again. Download or copy them now.</p>
          </div>

          <div className="bg-gray-50 border rounded-lg p-4">
            <div className="grid grid-cols-2 gap-2">
              {recoveryCodes.map((c, i) => (
                <code key={i} className="text-sm font-mono bg-white border rounded px-3 py-1.5 text-center select-all">{c}</code>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={copyRecoveryCodes} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 flex items-center justify-center gap-2 min-h-[44px]">
              <Copy size={14} /> Copy
            </button>
            <button onClick={downloadRecoveryCodes} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 flex items-center justify-center gap-2 min-h-[44px]">
              <Download size={14} /> Download
            </button>
          </div>

          <button onClick={() => { setStep('status'); setRecoveryCodes([]); setSuccess('Two-factor authentication is now active.'); }} className="w-full py-2.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 min-h-[44px]">
            Done
          </button>
        </div>
      )}

      {/* ── DISABLE ── */}
      {step === 'disable' && (
        <div className="bg-white border rounded-xl p-6 space-y-6">
          <div className="text-center">
            <ShieldOff size={24} className="mx-auto text-red-500 mb-2" />
            <h2 className="font-semibold text-lg">Disable Two-Factor Authentication</h2>
            <p className="text-sm text-gray-500 mt-1">Enter your authenticator code or a recovery code to disable 2FA.</p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-700 font-medium text-center">Warning: Disabling MFA will immediately lock you out of admin routes until you re-enable it.</p>
          </div>

          <div>
            <label htmlFor="disable-code" className="sr-only">Authentication code</label>
            <input
              id="disable-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={20}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
              placeholder="Authenticator or recovery code"
              className={inputClass}
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setStep('status'); setCode(''); }} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 min-h-[44px]">Cancel</button>
            <button onClick={handleDisable} disabled={loading || !code.trim()} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]">
              {loading ? <Loader2 size={16} className="animate-spin" /> : null} Disable 2FA
            </button>
          </div>
        </div>
      )}

      {/* ── CHANGE PASSWORD ── */}
      {step === 'change-password' && (
        <div className="bg-white border rounded-xl p-6 space-y-5">
          <h2 className="font-semibold text-lg">Change Password</h2>

          <div>
            <label htmlFor="current-pw" className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
            <div className="relative">
              <input id="current-pw" type={showPw ? 'text' : 'password'} value={currentPw} onChange={e => setCurrentPw(e.target.value)} className={inputClass} autoComplete="current-password" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" aria-label={showPw ? 'Hide password' : 'Show password'}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="new-pw" className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
            <input id="new-pw" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className={inputClass} autoComplete="new-password" placeholder="Min 10 chars, uppercase, lowercase, digit" />
          </div>

          <div>
            <label htmlFor="confirm-pw" className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
            <input id="confirm-pw" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className={inputClass} autoComplete="new-password" />
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setStep('status'); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 min-h-[44px]">Cancel</button>
            <button onClick={handleChangePassword} disabled={loading || !currentPw || !newPw} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[44px]">
              {loading ? <Loader2 size={16} className="animate-spin" /> : null} Change Password
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
