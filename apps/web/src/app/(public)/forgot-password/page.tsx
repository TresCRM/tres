'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useForm } from 'react-hook-form';
import api from '@/lib/api';
import { Building2, Mail, Loader2, AlertCircle, CheckCircle, ArrowLeft } from 'lucide-react';

interface FormData { tenantSlug: string; email: string; }

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors }, getValues } = useForm<FormData>();

  async function onSubmit(data: FormData) {
    setError('');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', {
        email: data.email.trim().toLowerCase(),
        tenantSlug: data.tenantSlug.trim().toLowerCase(),
      });
      setSent(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = (hasError: boolean) =>
    `w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary,#4F46E5)] focus:border-transparent ${
      hasError ? 'border-red-300 bg-red-50/50' : 'border-gray-300'
    }`;

  if (sent) {
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Check your email</h1>
          <p className="text-gray-500 text-sm mb-6">
            If an account exists for <strong>{getValues('email')}</strong>, we sent a password reset link.
            The link expires in 1 hour.
          </p>
          <Link href="/signin" className="text-sm text-[var(--brand-primary,#4F46E5)] font-medium hover:underline inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo-md.png" alt="TRES CRM" width={72} height={24} className="mx-auto mb-4" priority />
          <h1 className="text-2xl font-bold">Forgot your password?</h1>
          <p className="text-gray-500 text-sm mt-1">Enter your workspace and email to receive a reset link.</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3" role="alert">
            <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div>
            <label htmlFor="tenantSlug" className="block text-sm font-medium text-gray-700 mb-1.5">Workspace</label>
            <div className="relative">
              <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input id="tenantSlug" type="text" {...register('tenantSlug', { required: 'Workspace is required' })} placeholder="your-company" className={inputClass(!!errors.tenantSlug)} autoFocus />
            </div>
            {errors.tenantSlug && <p className="text-red-600 text-xs mt-1.5">{errors.tenantSlug.message}</p>}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input id="email" type="email" {...register('email', { required: 'Email is required' })} placeholder="you@example.com" className={inputClass(!!errors.email)} />
            </div>
            {errors.email && <p className="text-red-600 text-xs mt-1.5">{errors.email.message}</p>}
          </div>

          <button type="submit" disabled={loading} className="w-full py-3 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-semibold text-sm hover:opacity-90 min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <><Loader2 size={18} className="animate-spin" /> Sending...</> : 'Send reset link'}
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
