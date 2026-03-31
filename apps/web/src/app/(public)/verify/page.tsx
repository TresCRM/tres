'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/apiClient';
import { CheckCircle, XCircle, Loader2, ArrowRight, RotateCcw, MailCheck } from 'lucide-react';

function VerifyForm() {
  const params = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const token = params.get('token');
  const email = params.get('email');
  const tenant = params.get('tenant');

  useEffect(() => {
    if (!token || !email || !tenant) {
      setStatus('error');
      setMessage('Missing verification parameters. Please use the link from your email.');
      return;
    }

    authApi.verify({ email, tenantSlug: tenant, token })
      .then(() => {
        setStatus('success');
        setMessage('Your email has been verified successfully!');
      })
      .catch((err) => {
        setStatus('error');
        const code = err?.response?.data?.error;
        const messages: Record<string, string> = {
          expired_token: 'This verification link has expired. Please request a new one.',
          bad_token: 'This verification link is invalid. Please request a new one.',
          already_verified: 'Your email is already verified. You can sign in.',
        };
        setMessage(messages[code] || 'Verification failed. Please try again or request a new link.');
      });
  }, [token, email, tenant]);

  const handleResend = async () => {
    if (!email || !tenant) return;
    setResending(true);
    try {
      await authApi.resend({ email, tenantSlug: tenant });
      setResent(true);
    } catch {
      // silent fail
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        {/* Loading */}
        {status === 'loading' && (
          <div role="status" aria-label="Verifying your email">
            <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader2 size={32} className="animate-spin text-[var(--brand-primary,#4F46E5)]" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Verifying your email</h1>
            <p className="text-gray-500">Please wait while we confirm your email address...</p>
          </div>
        )}

        {/* Success */}
        {status === 'success' && (
          <div role="alert">
            <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={36} className="text-green-500" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Email verified!</h1>
            <p className="text-gray-600 mb-8">{message}</p>
            <Link
              href={`/signin?tenant=${encodeURIComponent(tenant || '')}&email=${encodeURIComponent(email || '')}`}
              className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity min-h-[48px]"
            >
              Continue to sign in <ArrowRight size={18} />
            </Link>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div role="alert">
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
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px] disabled:opacity-50"
                >
                  {resending ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                  Resend verification email
                </button>
              )}
              {resent && (
                <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
                  <MailCheck size={16} /> New verification email sent!
                </div>
              )}
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 px-5 py-2.5 border rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]">
                Back to sign up
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
