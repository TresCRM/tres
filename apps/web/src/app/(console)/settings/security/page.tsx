'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { mfaApi, authApi } from '@/lib/apiClient';
import { ShieldCheck, ShieldOff, QrCode, Copy, Download, Loader2, AlertCircle, CheckCircle2, Eye, EyeOff, Lock, AlertTriangle } from 'lucide-react';

type Step = 'status' | 'setup' | 'verify' | 'recovery' | 'disable' | 'change-password';

export default function SecuritySettingsPage() {
  const params = useSearchParams();
  const setupRequired = params.get('setup') === 'required';
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

  useEffect(() => {
    mfaApi.status().then(r => { setMfaEnabled(r.data.mfaEnabled); setLoading(false); }).catch(() => setLoading(false));
  }, []);

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

  function downloadRecoveryCodes() {
    const text = `TRES CRM Recovery Codes\nGenerated: ${new Date().toISOString()}\n\n${recoveryCodes.join('\n')}\n\nStore these codes in a safe place. Each code can only be used once.`;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'tres-crm-recovery-codes.txt'; a.click();
    URL.revokeObjectURL(url);
  }

  function copyRecoveryCodes() {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setSuccess('Recovery codes copied to clipboard.');
    setTimeout(() => setSuccess(''), 3000);
  }

  const inputClass = 'w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary,#4F46E5)] focus:border-transparent';

  if (loading && step === 'status') {
    return <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold mb-1">Security Settings</h1>
      <p className="text-gray-500 text-sm mb-6">Manage two-factor authentication and password settings.</p>

      {setupRequired && !mfaEnabled && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-800">MFA Required for Admin Accounts</p>
            <p className="text-xs text-amber-600 mt-0.5">Your role requires two-factor authentication. Please enable it to continue using the console.</p>
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
          <div className="bg-white border rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {mfaEnabled ? <ShieldCheck size={24} className="text-emerald-600" /> : <ShieldOff size={24} className="text-gray-400" />}
                <div>
                  <h2 className="font-semibold">Two-Factor Authentication</h2>
                  <p className="text-sm text-gray-500">{mfaEnabled ? 'Your account is protected with 2FA.' : 'Add an extra layer of security to your account.'}</p>
                </div>
              </div>
              {mfaEnabled ? (
                <button onClick={() => { setStep('disable'); setError(''); setCode(''); }} className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                  Disable
                </button>
              ) : (
                <button onClick={handleSetup} disabled={loading} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50">
                  {loading ? 'Setting up...' : 'Enable 2FA'}
                </button>
              )}
            </div>
          </div>

          <div className="bg-white border rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Lock size={24} className="text-gray-500" />
                <div>
                  <h2 className="font-semibold">Password</h2>
                  <p className="text-sm text-gray-500">Change your password regularly for better security.</p>
                </div>
              </div>
              <button onClick={() => { setStep('change-password'); setError(''); setSuccess(''); }} className="px-4 py-2 text-sm border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                Change Password
              </button>
            </div>
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Enter the 6-digit code to verify</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-2xl tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep('status')} className="flex-1 py-2.5 border border-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleVerify} disabled={loading || code.length < 6} className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
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

          <div className="bg-gray-50 border rounded-lg p-4">
            <div className="grid grid-cols-2 gap-2">
              {recoveryCodes.map((c, i) => (
                <code key={i} className="text-sm font-mono bg-white border rounded px-3 py-1.5 text-center select-all">{c}</code>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={copyRecoveryCodes} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 flex items-center justify-center gap-2">
              <Copy size={14} /> Copy
            </button>
            <button onClick={downloadRecoveryCodes} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 flex items-center justify-center gap-2">
              <Download size={14} /> Download
            </button>
          </div>

          <button onClick={() => { setStep('status'); setRecoveryCodes([]); setSuccess('Two-factor authentication is now active.'); }} className="w-full py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm hover:opacity-90">
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

          <input
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

          <div className="flex gap-3">
            <button onClick={() => { setStep('status'); setCode(''); }} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleDisable} disabled={loading || !code.trim()} className="flex-1 py-2.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
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
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Current Password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={currentPw} onChange={e => setCurrentPw(e.target.value)} className={inputClass} autoComplete="current-password" />
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

          <div className="flex gap-3">
            <button onClick={() => { setStep('status'); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleChangePassword} disabled={loading || !currentPw || !newPw} className="flex-1 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <Loader2 size={16} className="animate-spin" /> : null} Change Password
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
