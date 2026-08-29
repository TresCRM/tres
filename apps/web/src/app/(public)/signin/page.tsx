'use client';

import { Suspense, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { authApi, subscriptionsApi } from '@/lib/apiClient';
import { useAuthStore } from '@/stores/authStore';
import Image from 'next/image';
import { LogIn, Building2, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2, ShieldCheck } from 'lucide-react';

/** After login, check subscription status and route accordingly */
async function resolvePostLoginRoute(user: { roles?: string[] }, passwordExpired: boolean, mfaSetupRequired: boolean): Promise<string> {
  const ADMIN_ROLES = ['SUPER_ADMIN', 'MANAGER', 'SALES', 'CUSTOMER_CARE', 'SPECIAL'];
  const isAdmin = user.roles?.some((r: string) => ADMIN_ROLES.includes(r));

  if (passwordExpired) return isAdmin ? '/admin/security' : '/settings/change-password';
  if (mfaSetupRequired) return isAdmin ? '/admin/security?setup=required' : '/settings/security?setup=required';
  if (isAdmin) return '/admin';

  // Check if tenant has an active subscription
  try {
    const res = await subscriptionsApi.me();
    const sub = res.data?.data;
    if (sub && ['ACTIVE', 'GRACE'].includes(sub.status)) {
      return '/dashboard';
    }
  } catch {
    // If the check fails (e.g. no subscription at all), redirect to plan selection
  }
  return '/choose-plan';
}

const schema = z.object({
  tenantSlug: z.string().min(1, 'Workspace slug is required'),
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

function MfaStep({ ticket, onBack, onError }: { ticket: string; onBack: () => void; onError: (msg: string) => void }) {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setError('');
    setLoading(true);
    try {
      const res = await authApi.mfaVerify({ mfaTicket: ticket, code: code.trim() });
      const { accessToken, user, tenant, passwordExpired, mfaSetupRequired } = res.data;
      setAuth({ id: user.id, email: user.email, tenantId: tenant.id, tenantSlug: tenant.slug, roles: user.roles }, accessToken);
      const route = await resolvePostLoginRoute(user, passwordExpired, mfaSetupRequired);
      router.push(route);
    } catch (err: any) {
      const errCode = err?.response?.data?.error;
      if (errCode === 'mfa_expired') {
        onError('MFA session expired. Please sign in again.');
        onBack();
      } else {
        setError('Invalid code. Enter your 6-digit authenticator code or a recovery code.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ShieldCheck size={26} className="text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold">Two-Factor Authentication</h1>
          <p className="text-gray-500 text-sm mt-1">Enter the code from your authenticator app</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3" role="alert">
            <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-5">
          <div>
            <label htmlFor="mfa-code" className="block text-sm font-medium text-gray-700 mb-1.5">Authentication Code</label>
            <input
              ref={inputRef}
              id="mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={20}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
              placeholder="000000"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg text-center text-2xl tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-2 text-center">Or enter a recovery code</p>
          </div>

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full py-3 bg-emerald-600 text-white rounded-lg font-semibold text-sm hover:bg-emerald-700 transition-colors min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <><Loader2 size={18} className="animate-spin" /> Verifying...</> : 'Verify'}
          </button>

          <button type="button" onClick={onBack} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Back to sign in
          </button>
        </form>
      </div>
    </div>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { setAuth } = useAuthStore();
  // Map OAuth redirect errors to user-friendly messages
  const oauthErrorMessages: Record<string, string> = {
    oauth_denied: 'Google sign-in was cancelled.',
    oauth_no_account: `No account found for ${params.get('email') || 'that email'}. Please sign up first, then use Google to sign in.`,
    oauth_tenant_inactive: 'Your workspace is inactive. Please contact support.',
    oauth_token_failed: 'Google sign-in failed. Please try again.',
    oauth_userinfo_failed: 'Could not retrieve your Google profile. Please try again.',
    oauth_server_error: 'Something went wrong during Google sign-in. Please try again.',
    oauth_invalid_state: 'Google sign-in session expired. Please try again.',
    oauth_no_code: 'Google sign-in did not return an authorization code. Please try again.',
    oauth_no_email: 'Google did not provide an email address. Please try again.',
  };
  const initialError = oauthErrorMessages[params.get('error') || ''] || '';

  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);

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

      // MFA challenge
      if (res.data.mfaRequired) {
        setMfaTicket(res.data.mfaTicket);
        return;
      }

      const { accessToken, user, tenant, passwordExpired, mfaSetupRequired } = res.data;
      setAuth({ id: user.id, email: user.email, tenantId: tenant.id, tenantSlug: tenant.slug, roles: user.roles }, accessToken);
      const route = await resolvePostLoginRoute(user, passwordExpired, mfaSetupRequired);
      router.push(route);
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

  if (mfaTicket) {
    return <MfaStep ticket={mfaTicket} onBack={() => { setMfaTicket(null); }} onError={setError} />;
  }

  const inputClass = (hasError: boolean) =>
    `w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary,#4F46E5)] focus:border-transparent ${
      hasError ? 'border-red-300 bg-red-50/50' : 'border-gray-300'
    }`;

  return (
    <div className="min-h-[calc(100vh-200px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Image src="/logo-md.png" alt="TRES CRM" width={72} height={24} className="mx-auto mb-4" priority />
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-gray-500 text-sm mt-1">Sign in to your TRES CRM workspace</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3" role="alert" aria-live="assertive">
            <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <div>
            <label htmlFor="tenantSlug" className="block text-sm font-medium text-gray-700 mb-1.5">Workspace</label>
            <div className="relative">
              <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input id="tenantSlug" type="text" {...register('tenantSlug', { required: true })} placeholder="your-company" className={inputClass(!!errors.tenantSlug)} autoComplete="organization" autoFocus aria-invalid={!!errors.tenantSlug} aria-describedby={errors.tenantSlug ? 'slug-err' : undefined} />
            </div>
            {errors.tenantSlug && <p id="slug-err" className="text-red-600 text-xs mt-1.5 flex items-center gap-1" role="alert"><AlertCircle size={12} />{errors.tenantSlug.message}</p>}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input id="email" type="email" {...register('email', { required: true })} placeholder="you@example.com" className={inputClass(!!errors.email)} autoComplete="email" aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-err' : undefined} />
            </div>
            {errors.email && <p id="email-err" className="text-red-600 text-xs mt-1.5 flex items-center gap-1" role="alert"><AlertCircle size={12} />{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input id="password" type={showPw ? 'text' : 'password'} {...register('password', { required: true })} placeholder="Enter your password" className={`${inputClass(!!errors.password)} pr-10`} autoComplete="current-password" aria-invalid={!!errors.password} aria-describedby={errors.password ? 'pw-err' : undefined} />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5" aria-label={showPw ? 'Hide password' : 'Show password'} tabIndex={-1}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && <p id="pw-err" className="text-red-600 text-xs mt-1.5 flex items-center gap-1" role="alert"><AlertCircle size={12} />{errors.password.message}</p>}
          </div>

          <button type="submit" disabled={loading} className="w-full py-3 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-semibold text-sm hover:opacity-90 transition-opacity min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? <><Loader2 size={18} className="animate-spin" /> Signing in...</> : <><LogIn size={18} /> Sign in</>}
          </button>
        </form>

        {/* Google OAuth divider + button */}
        <div className="mt-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 uppercase tracking-wide">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <a
          href={`${process.env.NEXT_PUBLIC_API_BASE_URL}/oauth/google`}
          className="mt-4 w-full py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors flex items-center justify-center gap-3"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.01 24.01 0 0 0 0 21.56l7.98-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Sign in with Google
        </a>

        <div className="mt-6 text-center space-y-3">
          <Link href="/forgot-password" className="text-sm text-[var(--brand-primary,#4F46E5)] hover:underline">
            Forgot your password?
          </Link>
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
