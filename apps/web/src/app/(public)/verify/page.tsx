'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/apiClient';
import { Button } from '@/components/ui/Button';

function VerifyForm() {
  const params = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  const token = params.get('token');
  const email = params.get('email');
  const tenant = params.get('tenant');

  useEffect(() => {
    if (!token || !email || !tenant) {
      setStatus('error');
      setMessage('Missing verification parameters. Check your email link.');
      return;
    }

    authApi.verify({ email, tenantSlug: tenant, token })
      .then(() => {
        setStatus('success');
        setMessage('Email verified! You can now sign in.');
      })
      .catch((err) => {
        setStatus('error');
        const code = err?.response?.data?.error;
        if (code === 'expired_token') setMessage('Verification link has expired. Request a new one.');
        else if (code === 'bad_token') setMessage('Invalid verification token.');
        else setMessage('Verification failed. Please try again.');
      });
  }, [token, email, tenant]);

  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold mb-6">Email Verification</h1>

      {status === 'loading' && (
        <div role="status" aria-label="Verifying">
          <div className="animate-spin h-8 w-8 border-4 border-gray-300 border-t-[var(--brand-primary,#4F46E5)] rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Verifying your email...</p>
        </div>
      )}

      {status === 'success' && (
        <div role="alert">
          <div className="text-green-600 text-4xl mb-4">&#10003;</div>
          <p className="text-gray-700 mb-6">{message}</p>
          <Link href={`/signin?tenant=${encodeURIComponent(tenant || '')}&email=${encodeURIComponent(email || '')}`}>
            <Button variant="primary">Sign in</Button>
          </Link>
        </div>
      )}

      {status === 'error' && (
        <div role="alert">
          <div className="text-red-500 text-4xl mb-4">&#10007;</div>
          <p className="text-gray-700 mb-6">{message}</p>
          <Link href="/signup">
            <Button variant="secondary">Back to Signup</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function VerifyPage() {
  return <Suspense fallback={<div className="flex justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-gray-300 border-t-blue-600 rounded-full" /></div>}><VerifyForm /></Suspense>;
}
