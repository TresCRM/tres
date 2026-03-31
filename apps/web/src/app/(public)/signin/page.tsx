'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { authApi } from '@/lib/apiClient';
import { useAuthStore } from '@/stores/authStore';
import { LogIn, Building2, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';

const schema = z.object({
  tenantSlug: z.string().min(1, 'Workspace slug is required'),
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      tenantSlug: params.get('tenant') || '',
      email: params.get('email') || '',
      password: '',
    },
  });

  async function onSubmit(data: FormData) {
    setError('');
    setLoading(true);
    try {
      const normalized = { ...data, email: data.email.trim().toLowerCase(), tenantSlug: data.tenantSlug.trim().toLowerCase() };
      const res = await authApi.login(normalized);
      const { accessToken, user, tenant } = res.data;
      setAuth({ id: user.id, email: user.email, tenantId: tenant.id, tenantSlug: tenant.slug, roles: user.roles }, accessToken);
      router.push('/dashboard');
    } catch (err: any) {
      const code = err?.response?.data?.error;
      const messages: Record<string, string> = {
        bad_credentials: 'Invalid email or password. Please try again.',
        user_not_active: 'Your account is not verified. Please check your email for the verification link.',
        account_locked: 'Your account has been temporarily locked due to too many failed attempts. Please try again later.',
        tenant_not_found: 'Workspace not found. Please check your workspace slug.',
      };
      setError(messages[code] || 'Sign in failed. Please check your details and try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = (hasError: boolean) =>
    `w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary,#4F46E5)] focus:border-transparent ${
      hasError ? 'border-red-300 bg-red-50/50' : 'border-gray-300'
    }`;

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-[var(--brand-primary,#4F46E5)] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <LogIn size={26} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your TRES CRM workspace</p>
        </div>

        {/* Error alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3" role="alert" aria-live="assertive">
            <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div>
            <label htmlFor="tenantSlug" className="block text-sm font-medium text-gray-700 mb-1.5">Workspace</label>
            <div className="relative">
              <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="tenantSlug"
                type="text"
                {...register('tenantSlug', { required: true })}
                placeholder="your-company"
                className={inputClass(!!errors.tenantSlug)}
                autoComplete="organization"
                autoFocus
                aria-invalid={!!errors.tenantSlug}
                aria-describedby={errors.tenantSlug ? 'slug-err' : undefined}
              />
            </div>
            {errors.tenantSlug && <p id="slug-err" className="text-red-600 text-xs mt-1.5 flex items-center gap-1" role="alert"><AlertCircle size={12} />{errors.tenantSlug.message}</p>}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="email"
                type="email"
                {...register('email', { required: true })}
                placeholder="you@example.com"
                className={inputClass(!!errors.email)}
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-err' : undefined}
              />
            </div>
            {errors.email && <p id="email-err" className="text-red-600 text-xs mt-1.5 flex items-center gap-1" role="alert"><AlertCircle size={12} />{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                id="password"
                type={showPw ? 'text' : 'password'}
                {...register('password', { required: true })}
                placeholder="Enter your password"
                className={`${inputClass(!!errors.password)} pr-10`}
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'pw-err' : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                aria-label={showPw ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p id="pw-err" className="text-red-600 text-xs mt-1.5 flex items-center gap-1" role="alert"><AlertCircle size={12} />{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <><Loader2 size={18} className="animate-spin" /> Signing in...</> : <><LogIn size={18} /> Sign in</>}
          </button>
        </form>

        {/* Footer links */}
        <div className="mt-8 text-center space-y-3">
          <p className="text-sm text-gray-500">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-[var(--brand-primary,#4F46E5)] font-medium hover:underline">Create one free</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center" role="status" aria-label="Loading">
        <Loader2 size={32} className="animate-spin text-[var(--brand-primary,#4F46E5)]" />
      </div>
    }>
      <SignInForm />
    </Suspense>
  );
}
