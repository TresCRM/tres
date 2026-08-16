'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { Lock, Loader2, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';

interface FormData { newPassword: string; confirmPassword: string; }

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const email = params.get('email') || '';
  const tenant = params.get('tenant') || '';

  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors }, watch } = useForm<FormData>();

  async function onSubmit(data: FormData) {
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        token,
        email: email.toLowerCase(),
        tenantSlug: tenant.toLowerCase(),
        newPassword: data.newPassword,
      });
      setDone(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error;
      setError(msg === 'invalid_reset_token' ? 'This reset link is invalid or has expired. Please request a new one.' : msg || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  if (!token || !email || !tenant) {
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <AlertCircle size={32} className="mx-auto text-red-500 mb-4" />
          <h1 className="text-xl font-bold mb-2">Invalid reset link</h1>
          <p className="text-gray-500 text-sm mb-4">This link is missing required parameters.</p>
          <Link href="/forgot-password" className="text-sm text-[var(--brand-primary,#4F46E5)] font-medium hover:underline">
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Password reset</h1>
          <p className="text-gray-500 text-sm mb-6">Your password has been changed. You can now sign in.</p>
          <Link href={`/signin?tenant=${encodeURIComponent(tenant)}&email=${encodeURIComponent(email)}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm hover:opacity-90 min-h-[48px]">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const inputClass = (hasError: boolean) =>
    `w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary,#4F46E5)] focus:border-transparent ${
      hasError ? 'border-red-300 bg-red-50/50' : 'border-gray-300'
    }`;

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo-md.png" alt="TRES CRM" width={72} height={24} className="mx-auto mb-4" priority />
          <h1 className="text-2xl font-bold">Set new password</h1>
          <p className="text-gray-500 text-sm mt-1">for {email}</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3" role="alert">
            <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input id="newPassword" type="password" {...register('newPassword', {
                required: 'Password is required',
                minLength: { value: 10, message: 'At least 10 characters' },
                pattern: { value: /(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])/, message: 'Must include uppercase, lowercase, and digit' },
              })} placeholder="New password" className={inputClass(!!errors.newPassword)} autoFocus />
            </div>
            {errors.newPassword && <p className="text-red-600 text-xs mt-1.5">{errors.newPassword.message}</p>}
            <p className="text-xs text-gray-400 mt-1">Min 10 characters, uppercase, lowercase, and digit.</p>
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input id="confirmPassword" type="password" {...register('confirmPassword', {
                required: 'Please confirm',
                validate: v => v === watch('newPassword') || 'Passwords do not match',
              })} placeholder="Confirm password" className={inputClass(!!errors.confirmPassword)} />
            </div>
            {errors.confirmPassword && <p className="text-red-600 text-xs mt-1.5">{errors.confirmPassword.message}</p>}
          </div>

          <button type="submit" disabled={loading} className="w-full py-3 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-semibold text-sm hover:opacity-90 min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <><Loader2 size={18} className="animate-spin" /> Resetting...</> : 'Reset password'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/signin" className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-[calc(100vh-200px)] flex items-center justify-center"><Loader2 size={32} className="animate-spin text-gray-400" /></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
