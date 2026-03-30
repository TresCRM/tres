'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { authApi } from '@/lib/apiClient';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';

const schema = z.object({
  tenantSlug: z.string().min(1, 'Tenant slug is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      const res = await authApi.login(data);
      const { accessToken, user, tenant } = res.data;

      setAuth(
        {
          id: user.id,
          email: user.email,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          roles: user.roles,
        },
        accessToken
      );

      router.push('/dashboard');
    } catch (err: any) {
      const code = err?.response?.data?.error;
      if (code === 'bad_credentials') setError('Invalid email or password.');
      else if (code === 'user_not_active') setError('Account not verified. Check your email.');
      else if (code === 'account_locked') setError('Account locked. Try again later.');
      else if (code === 'tenant_not_found') setError('Tenant not found. Check your tenant slug.');
      else setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-bold text-center mb-8">Sign in to TRES CRM</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="tenantSlug" className="block text-sm font-medium mb-1">Tenant Slug</label>
          <input
            id="tenantSlug"
            type="text"
            {...register('tenantSlug', { required: true })}
            placeholder="your-company"
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary,#4F46E5)]"
            autoComplete="organization"
            aria-invalid={!!errors.tenantSlug}
            aria-describedby={errors.tenantSlug ? 'tenantSlug-error' : undefined}
          />
          {errors.tenantSlug && <p id="tenantSlug-error" className="text-red-600 text-xs mt-1">{errors.tenantSlug.message}</p>}
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
          <input
            id="email"
            type="email"
            {...register('email', { required: true })}
            placeholder="you@example.com"
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary,#4F46E5)]"
            autoComplete="email"
            aria-invalid={!!errors.email}
          />
          {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-1">Password</label>
          <input
            id="password"
            type="password"
            {...register('password', { required: true })}
            placeholder="Your password"
            className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary,#4F46E5)]"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
          />
          {errors.password && <p className="text-red-600 text-xs mt-1">{errors.password.message}</p>}
        </div>

        <Button type="submit" variant="primary" block disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      <p className="text-center text-sm mt-6 text-gray-600">
        Don't have an account?{' '}
        <Link href="/signup" className="text-[var(--brand-primary,#4F46E5)] font-medium hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
  return <Suspense fallback={<div className="flex justify-center py-16"><div className="animate-spin h-8 w-8 border-4 border-gray-300 border-t-blue-600 rounded-full" /></div>}><SignInForm /></Suspense>;
}
