'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/apiClient';
import { CheckCircle, XCircle, Loader2, ArrowRight, RotateCcw, MailCheck, KeyRound } from 'lucide-react';

type Status = 'loading' | 'input' | 'verifying' | 'success' | 'error';

function VerifyForm() {
  const params = useSearchParams();
  const router = useRouter();
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const token = params.get('token') || '';
  const emailParam = params.get('email') || '';
  const tenantParam = params.get('tenant') || '';

  const [status, setStatus] = useState<Status>(() => (token && emailParam && tenantParam ? 'loading' : 'input'));
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState(emailParam);
  const [tenant, setTenant] = useState(tenantParam);
  const [code, setCode] = useState('');
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [retryAfterSec, setRetryAfterSec] = useState<number | null>(null);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  /** Normalize error responses from /auth/verify into user-friendly messages */
  function handleVerifyError(err: any) {
    const data = err?.response?.data || {};
    const errorCode = data.error;

    if (errorCode === 'too_many_attempts') {
      setStatus('error');
      setRetryAfterSec(data.retryAfterSeconds || 900);
      setMessage(`Too many failed attempts. Please wait ${Math.ceil((data.retryAfterSeconds || 900) / 60)} minutes or request a new code.`);
      return;
    }

    if (errorCode === 'expired') {
      setStatus('error');
      setMessage('Your verification code has expired. Please request a new one.');
      return;
    }

    if (data.remainingAttempts !== undefined) {
      setRemainingAttempts(data.remainingAttempts);
      setStatus('input');
      setMessage(`${data.message || 'Invalid code.'} ${data.remainingAttempts} attempt(s) remaining.`);
      // Clear code so user can retype
      setCode('');
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
      return;
    }

    const genericMessages: Record<string, string> = {
      tenant_not_found: 'We could not find that workspace. Please check the URL.',
      no_verification: 'No verification is pending for this email.',
      bad_token: 'This verification link is invalid.',
      bad_code: 'That code is not correct.',
    };
    setStatus('error');
    setMessage(genericMessages[errorCode] || data.message || 'Verification failed. Please try again or request a new code.');
  }

  // Auto-verify when arriving via magic link (token in URL)
  useEffect(() => {
    if (token && emailParam && tenantParam) {
      authApi.verify({ email: emailParam, tenantSlug: tenantParam, token })
        .then(() => {
          setStatus('success');
          setMessage('Your email has been verified successfully!');
        })
        .catch(handleVerifyError);
    }
  }, [token, emailParam, tenantParam]);

  /** Submit typed code */
  async function submitCode() {
    const cleaned = code.replace(/\D/g, '');
    if (cleaned.length !== 6) return;
    if (!email || !tenant) {
      setMessage('Please enter your email and workspace.');
      return;
    }
    setStatus('verifying');
    setMessage('');
    try {
      await authApi.verify({ email, tenantSlug: tenant, code: cleaned });
      setStatus('success');
      setMessage('Your email has been verified successfully!');
    } catch (err: any) {
      handleVerifyError(err);
    }
  }

  async function handleResend() {
    if (!email || !tenant) return;
    setResending(true);
    try {
      await authApi.resend({ email, tenantSlug: tenant });
      setResent(true);
      // Reset any lockout / attempt state on successful resend
      setRemainingAttempts(null);
      setRetryAfterSec(null);
      setMessage('');
      setCode('');
      setStatus('input');
      setTimeout(() => setResent(false), 5000);
    } catch {
      // silent — endpoint returns 200 on valid tenant regardless
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } finally {
      setResending(false);
    }
  }

  /** Handle per-digit change in OTP boxes */
  function handleDigitChange(i: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = code.padEnd(6, ' ').split('');
    next[i] = digit || ' ';
    setCode(next.join('').trimEnd());
    if (digit && i < 5) {
      inputRefs.current[i + 1]?.focus();
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      inputRefs.current[i - 1]?.focus();
    } else if (e.key === 'Enter') {
      submitCode();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length >= 4) {
      e.preventDefault();
      setCode(pasted);
      // Auto-submit if complete
      if (pasted.length === 6) {
        setTimeout(() => submitCode(), 50);
      }
    }
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Loading — auto-verifying from link */}
        {status === 'loading' && (
          <div className="text-center" role="status" aria-label="Verifying your email">
            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader2 size={32} className="animate-spin text-[var(--brand-primary,#4F46E5)]" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Verifying your email</h1>
            <p className="text-gray-500">Please wait while we confirm your email address...</p>
          </div>
        )}

        {/* Verifying — user submitted code */}
        {status === 'verifying' && (
          <div className="text-center" role="status" aria-label="Verifying your code">
            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader2 size={32} className="animate-spin text-[var(--brand-primary,#4F46E5)]" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Verifying code...</h1>
          </div>
        )}

        {/* Input — manual code entry */}
        {status === 'input' && (
          <div>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <KeyRound size={28} className="text-[var(--brand-primary,#4F46E5)]" />
              </div>
              <h1 className="text-2xl font-bold mb-2">Verify your email</h1>
              <p className="text-gray-500 text-sm">Enter the 6-digit code we sent to your email</p>
            </div>

            {/* Email + tenant fields (prefilled from URL params if available) */}
            {(!emailParam || !tenantParam) && (
              <div className="grid grid-cols-1 gap-3 mb-4">
                <div>
                  <label htmlFor="v-tenant" className="block text-xs font-medium text-gray-700 mb-1">Workspace</label>
                  <input
                    id="v-tenant"
                    type="text"
                    value={tenant}
                    onChange={(e) => setTenant(e.target.value)}
                    placeholder="your-workspace"
                    className="w-full border rounded-lg px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="v-email" className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                  <input
                    id="v-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full border rounded-lg px-3 py-2.5 text-sm"
                  />
                </div>
              </div>
            )}

            {emailParam && tenantParam && (
              <p className="text-xs text-gray-500 text-center mb-4">
                Sent to <strong>{emailParam}</strong>
              </p>
            )}

            {/* 6-box OTP input */}
            <div className="mb-2">
              <label className="sr-only">Verification code</label>
              <div className="flex justify-center gap-2" onPaste={handlePaste as any}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    autoFocus={i === 0}
                    value={code[i] || ''}
                    onChange={(e) => handleDigitChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    className="w-12 h-14 text-center text-xl font-mono font-semibold rounded-lg border-2 border-gray-300 focus:border-[var(--brand-primary,#4F46E5)] focus:outline-none"
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>
            </div>

            {message && (
              <p className="text-sm text-center mt-3 text-red-600" role="alert">{message}</p>
            )}

            <div className="mt-6 space-y-3">
              <button
                onClick={submitCode}
                disabled={code.replace(/\D/g, '').length !== 6 || !email || !tenant}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-semibold text-sm hover:opacity-90 disabled:opacity-40 min-h-[48px]"
              >
                Verify <ArrowRight size={18} />
              </button>

              <div className="flex items-center justify-center gap-4 text-sm">
                {!resent ? (
                  <button
                    onClick={handleResend}
                    disabled={resending || !email || !tenant}
                    className="inline-flex items-center gap-1.5 text-gray-600 hover:text-[var(--brand-primary,#4F46E5)] disabled:opacity-50"
                  >
                    {resending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                    Resend code
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-green-700">
                    <MailCheck size={14} /> New code sent!
                  </span>
                )}
                <span className="text-gray-300">|</span>
                <Link href="/signup" className="text-gray-600 hover:text-[var(--brand-primary,#4F46E5)]">Back to signup</Link>
              </div>
            </div>
          </div>
        )}

        {/* Success */}
        {status === 'success' && (
          <div className="text-center" role="alert">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={36} className="text-green-500" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Email verified!</h1>
            <p className="text-gray-600 mb-8">{message}</p>
            <Link
              href={`/signin?tenant=${encodeURIComponent(tenant)}&email=${encodeURIComponent(email)}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-semibold text-sm hover:opacity-90 min-h-[48px]"
            >
              Continue to sign in <ArrowRight size={18} />
            </Link>
          </div>
        )}

        {/* Error (terminal — expired / locked out) */}
        {status === 'error' && (
          <div className="text-center" role="alert">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle size={36} className="text-red-500" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Verification failed</h1>
            <p className="text-gray-600 mb-8">{message}</p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {email && tenant && !resent && (
                <button
                  onClick={handleResend}
                  disabled={resending}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm font-medium hover:opacity-90 min-h-[44px] disabled:opacity-50"
                >
                  {resending ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                  Request new code
                </button>
              )}
              {resent && (
                <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
                  <MailCheck size={16} /> New code sent — check your email
                </div>
              )}
              <button
                onClick={() => { setStatus('input'); setMessage(''); setCode(''); }}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
              >
                Enter code manually
              </button>
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]">
                Back to signup
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center" role="status" aria-label="Loading">
        <Loader2 size={32} className="animate-spin text-[var(--brand-primary,#4F46E5)]" />
      </div>
    }>
      <VerifyForm />
    </Suspense>
  );
}
