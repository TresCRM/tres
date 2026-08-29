'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePlans, useSubscription, useCheckout } from '@/hooks/useApi';
import { useAuthStore } from '@/stores/authStore';
import { subscriptionsApi } from '@/lib/apiClient';
import {
  Check, Crown, Zap, Shield, BarChart3, Globe, ArrowRight,
  Users as UsersIcon, Headphones, Rocket,
} from 'lucide-react';

function formatPrice(cents: number): string {
  if (cents === 0) return '$0';
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toLocaleString()}` : `$${dollars.toFixed(2)}`;
}

const FEATURE_ICONS: Record<string, typeof Check> = {
  sso: Shield, analytics: BarChart3, api: Globe, realtime: Zap,
};

export default function ChoosePlanPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { data: plans, isLoading } = usePlans();
  const { data: sub } = useSubscription();
  const checkout = useCheckout();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // If user already has an active subscription, send them to dashboard
  const subData = sub?.data;
  if (subData && ['ACTIVE', 'GRACE'].includes(subData.status)) {
    router.replace('/dashboard');
    return null;
  }

  async function handleSelect(plan: any) {
    setError(null);
    setBusy(plan.code);
    try {
      if (plan.priceCentsMonthly > 0 && !plan.isCustom) {
        // Paid plan — must go through Paystack
        const result = await checkout.mutateAsync({
          planCode: plan.code,
          interval: 'MONTH',
          email: user?.email || '',
          callbackUrl: `${window.location.origin}/billing?reference=`,
        });
        const url = result?.data?.authorizationUrl || result?.data?.authorization_url;
        if (url) {
          window.location.href = url;
          return;
        }
        setError('Could not initialize payment. Please try again.');
      } else {
        // Free plan — activate directly
        await subscriptionsApi.activate({ planCode: plan.code });
        router.push('/dashboard');
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.response?.data?.error || 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-[calc(100vh-120px)] flex flex-col items-center justify-center px-4 py-10">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-[var(--brand-primary,#4F46E5)]/10 flex items-center justify-center mx-auto mb-4">
            <Rocket size={28} className="text-[var(--brand-primary,#4F46E5)]" />
          </div>
          <h1 className="text-2xl font-bold">Choose your plan</h1>
          <p className="text-sm text-gray-500 mt-1">Select a plan to get started. You can upgrade or change anytime.</p>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 text-center" role="alert">
            {error}
          </div>
        )}

        {/* Plans */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-64 bg-gray-50 rounded-xl border animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {(plans || []).filter((p: any) => !p.isCustom).map((plan: any) => {
              const monthly = plan.priceCentsMonthly ?? 0;
              const isPopular = plan.code === 'CO-20';
              const isFree = monthly === 0;
              const ticketLimit = plan.entitlements?.ticketLimit;

              return (
                <div
                  key={plan.code}
                  className={`relative flex flex-col border rounded-xl p-5 bg-white shadow-sm hover:shadow-md transition-shadow ${
                    isPopular ? 'border-[var(--brand-primary,#4F46E5)] ring-1 ring-[var(--brand-primary,#4F46E5)]/20' : ''
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[var(--brand-primary,#4F46E5)] text-white text-xs font-semibold rounded-full flex items-center gap-1">
                      <Crown size={12} /> Popular
                    </div>
                  )}

                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  <div className="flex items-center gap-1.5 mt-1 mb-4">
                    <UsersIcon size={14} className="text-gray-400" />
                    <span className="text-sm text-gray-500">
                      {plan.seats} seat{plan.seats !== 1 ? 's' : ''}
                      {ticketLimit != null && ` / ${ticketLimit} tickets`}
                    </span>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">{formatPrice(monthly)}</span>
                      <span className="text-sm text-gray-400">/mo</span>
                    </div>
                    {isFree && <p className="text-xs text-green-600 font-medium mt-0.5">Free forever</p>}
                  </div>

                  {/* Feature list */}
                  <ul className="space-y-1.5 mb-5 flex-1 text-sm">
                    {['api', 'realtime', 'analytics', 'sso'].map(f => {
                      const enabled = !!plan.entitlements?.[f];
                      const Icon = FEATURE_ICONS[f] || Check;
                      const label = f === 'sso' ? 'SSO/SAML' : f === 'api' ? 'API Access' : f.charAt(0).toUpperCase() + f.slice(1);
                      return (
                        <li key={f} className={`flex items-center gap-2 ${enabled ? 'text-gray-700' : 'text-gray-300 line-through'}`}>
                          {enabled ? <Check size={14} className="text-green-500 shrink-0" /> : <span className="w-3.5 h-3.5 shrink-0" />}
                          {label}
                        </li>
                      );
                    })}
                  </ul>

                  <button
                    onClick={() => handleSelect(plan)}
                    disabled={busy === plan.code}
                    className={`w-full flex items-center justify-center gap-2 h-10 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                      isPopular
                        ? 'bg-[var(--brand-primary,#4F46E5)] text-white hover:opacity-90'
                        : isFree
                          ? 'border-2 border-gray-300 text-gray-700 hover:bg-gray-50'
                          : 'bg-gray-900 text-white hover:bg-gray-800'
                    } disabled:opacity-50`}
                  >
                    {busy === plan.code ? 'Processing...' : isFree ? 'Start Free' : 'Subscribe'}
                    {busy !== plan.code && <ArrowRight size={16} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Skip link */}
        <div className="text-center mt-6">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
