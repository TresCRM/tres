'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSubscription, usePlans, useCheckout } from '@/hooks/useApi';
import { useAuthStore } from '@/stores/authStore';
import { useSearchParams } from 'next/navigation';
import { subscriptionsApi } from '@/lib/apiClient';
import {
  CreditCard, Check, Crown, AlertTriangle, Clock, Zap,
  Users as UsersIcon, Shield, BarChart3, Globe, Headphones, ArrowRight,
} from 'lucide-react';

/* ─── Helpers ────────────────────────────────── */

function formatPrice(cents: number): string {
  if (cents === 0) return '$0';
  const dollars = cents / 100;
  // Show cents only if not a whole dollar
  return dollars % 1 === 0 ? `$${dollars.toLocaleString()}` : `$${dollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function daysUntil(date: string | Date): number {
  return Math.max(0, Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000));
}

const INTERVALS = [
  { value: 'MONTH', label: 'Monthly', discount: null },
  { value: 'QUARTER', label: 'Quarterly', discount: '5% off' },
  { value: 'SEMIANNUAL', label: '6 Months', discount: '8% off' },
  { value: 'ANNUAL', label: 'Annual', discount: '12% off' },
] as const;

function intervalMultiplier(interval: string): { months: number; factor: number } {
  switch (interval) {
    case 'QUARTER': return { months: 3, factor: 0.95 };
    case 'SEMIANNUAL': return { months: 6, factor: 0.92 };
    case 'ANNUAL': return { months: 12, factor: 0.88 };
    default: return { months: 1, factor: 1.0 };
  }
}

function computeTotal(priceCentsMonthly: number, interval: string, prepayPrices?: any): number {
  if (!priceCentsMonthly) return 0;
  // Use explicit prepay prices if available
  if (prepayPrices) {
    if (interval === 'QUARTER' && prepayPrices.price3Cents != null) return prepayPrices.price3Cents;
    if (interval === 'SEMIANNUAL' && prepayPrices.price6Cents != null) return prepayPrices.price6Cents;
    if (interval === 'ANNUAL' && prepayPrices.price12Cents != null) return prepayPrices.price12Cents;
  }
  const { months, factor } = intervalMultiplier(interval);
  return Math.round(priceCentsMonthly * months * factor);
}

/* ─── Feature badges ────────────────────────── */

const FEATURE_ICONS: Record<string, typeof Check> = {
  sso: Shield,
  analytics: BarChart3,
  api: Globe,
  realtime: Zap,
};

function FeatureBadge({ name, enabled }: { name: string; enabled: boolean }) {
  const Icon = FEATURE_ICONS[name] || Check;
  const label = name === 'sso' ? 'SSO' : name === 'api' ? 'API' : name.charAt(0).toUpperCase() + name.slice(1);
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${enabled ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-400 line-through'}`}>
      <Icon size={12} />
      {label}
    </span>
  );
}

/* ─── Current Plan Card ─────────────────────── */

function CurrentPlanCard({ subscription }: { subscription: any }) {
  if (!subscription) {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 bg-gray-50 text-center">
        <CreditCard size={32} className="mx-auto text-gray-400 mb-3" />
        <p className="font-semibold text-gray-700">No active subscription</p>
        <p className="text-sm text-gray-500 mt-1">Choose a plan below to get started.</p>
      </div>
    );
  }

  const status = subscription.status as string;
  const periodEnd = subscription.currentPeriodEnd;
  const days = daysUntil(periodEnd);

  const statusConfig: Record<string, { badge: string; color: string }> = {
    ACTIVE: { badge: 'Active', color: 'bg-green-100 text-green-700' },
    GRACE: { badge: 'Grace Period', color: 'bg-yellow-100 text-yellow-700' },
    PAST_DUE: { badge: 'Past Due', color: 'bg-orange-100 text-orange-700' },
    EXPIRED: { badge: 'Expired', color: 'bg-red-100 text-red-700' },
    CANCELED: { badge: 'Canceled', color: 'bg-gray-100 text-gray-600' },
  };

  const cfg = statusConfig[status] || statusConfig.ACTIVE;

  return (
    <div className="border rounded-xl p-6 bg-white shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Current Plan</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage your subscription</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.color}`}>{cfg.badge}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Plan</p>
          <p className="text-lg font-bold mt-0.5">{subscription.planCode}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Seats</p>
          <p className="text-lg font-bold mt-0.5">{subscription.seats || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Billing</p>
          <p className="text-sm font-medium mt-0.5">{subscription.interval || 'MONTH'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">
            {status === 'CANCELED' ? 'Access Until' : 'Renews'}
          </p>
          <p className="text-sm font-medium mt-0.5">
            {periodEnd ? new Date(periodEnd).toLocaleDateString() : '—'}
            {days > 0 && <span className="text-xs text-gray-400 ml-1">({days}d)</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ─── Plan Card ─────────────────────────────── */

function PlanCard({ plan, interval, isCurrent, onSelect, busy }: {
  plan: any;
  interval: string;
  isCurrent: boolean;
  onSelect: () => void;
  busy: boolean;
}) {
  const monthly = plan.priceCentsMonthly ?? 0;
  const total = computeTotal(monthly, interval, plan.prepayPrices);
  const { months } = intervalMultiplier(interval);
  const perMonth = months > 1 && total > 0 ? Math.round(total / months) : monthly;
  const ticketLimit = plan.entitlements?.ticketLimit;
  const isPopular = plan.code === 'CO-20';

  return (
    <div className={`relative flex flex-col border rounded-xl p-5 bg-white shadow-sm transition-shadow hover:shadow-md ${
      isCurrent ? 'ring-2 ring-[var(--brand-primary,#4F46E5)]' : ''
    } ${isPopular ? 'border-[var(--brand-primary,#4F46E5)]' : ''}`}>
      {isPopular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-[var(--brand-primary,#4F46E5)] text-white text-xs font-semibold rounded-full">
          Popular
        </div>
      )}
      {isCurrent && (
        <div className="absolute -top-3 right-4 px-3 py-0.5 bg-green-600 text-white text-xs font-semibold rounded-full">
          Current
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-bold">{plan.name}</h3>
        <div className="flex items-center gap-1.5 mt-1">
          <UsersIcon size={14} className="text-gray-400" />
          <span className="text-sm text-gray-500">{plan.seats} seat{plan.seats !== 1 ? 's' : ''}</span>
          {ticketLimit != null && (
            <span className="text-xs text-gray-400 ml-1">({ticketLimit} tickets)</span>
          )}
        </div>
      </div>

      {/* Price */}
      <div className="mb-4">
        {plan.isCustom ? (
          <div>
            <p className="text-2xl font-bold">Custom</p>
            <p className="text-xs text-gray-500">Contact sales</p>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold">{formatPrice(perMonth)}</span>
              <span className="text-sm text-gray-400">/mo</span>
            </div>
            {months > 1 && total > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">
                {formatPrice(total)} billed {interval === 'QUARTER' ? 'quarterly' : interval === 'SEMIANNUAL' ? 'every 6 months' : 'annually'}
              </p>
            )}
            {monthly === 0 && !plan.isCustom && (
              <p className="text-xs text-green-600 font-medium mt-0.5">Free forever</p>
            )}
          </div>
        )}
      </div>

      {/* Features */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {['api', 'realtime', 'analytics', 'sso'].map(f => (
          <FeatureBadge key={f} name={f} enabled={!!plan.entitlements?.[f]} />
        ))}
      </div>

      {/* Action */}
      <div className="mt-auto">
        {isCurrent ? (
          <div className="flex items-center justify-center gap-2 h-10 text-sm font-medium text-green-700 bg-green-50 rounded-lg">
            <Check size={16} /> Current plan
          </div>
        ) : plan.isCustom ? (
          <a
            href="mailto:sales@trescrm.com"
            className="flex items-center justify-center gap-2 h-10 text-sm font-medium border rounded-lg hover:bg-gray-50"
          >
            <Headphones size={16} /> Contact Sales
          </a>
        ) : (
          <button
            onClick={onSelect}
            disabled={busy}
            className="w-full flex items-center justify-center gap-2 h-10 text-sm font-medium text-white bg-[var(--brand-primary,#4F46E5)] rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Processing...' : monthly === 0 ? 'Select Free Plan' : 'Subscribe'}
            {!busy && <ArrowRight size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────── */

function BillingPageInner() {
  const { data: sub, isLoading: subLoading } = useSubscription();
  const { data: plans, isLoading: plansLoading } = usePlans();
  const { user } = useAuthStore();
  const checkout = useCheckout();
  const params = useSearchParams();

  const [interval, setBillingInterval] = useState<string>('MONTH');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Handle Paystack callback redirect
  const reference = params.get('reference');
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!reference || verified) return;
    subscriptionsApi.verify(reference)
      .then(() => {
        setSuccess('Payment verified! Your subscription is now active.');
        setVerified(true);
        // Reload to show updated subscription
        setTimeout(() => window.location.replace('/billing'), 1500);
      })
      .catch(() => {
        setError('Could not verify payment. Please contact support if you were charged.');
        setVerified(true);
      });
  }, [reference, verified]);

  async function handleSelect(plan: any) {
    setError(null);
    setBusy(plan.code);

    try {
      if (plan.priceCentsMonthly > 0 && !plan.isCustom) {
        // Paid plan — must go through Paystack
        const result = await checkout.mutateAsync({
          planCode: plan.code,
          interval,
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
        setSuccess(`Switched to ${plan.name} plan!`);
        window.location.reload();
      }
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || 'Something went wrong';
      setError(typeof msg === 'string' ? msg : 'Failed to process. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  const currentPlanCode = sub?.data?.planCode;

  return (
    <div className="max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-full bg-[var(--brand-primary,#4F46E5)]/10 flex items-center justify-center">
          <CreditCard size={20} className="text-[var(--brand-primary,#4F46E5)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-sm text-gray-500">Manage your subscription and billing</p>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700" role="alert">
          <AlertTriangle size={16} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
          <Check size={16} />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto text-green-400 hover:text-green-600">&times;</button>
        </div>
      )}

      {/* Current plan */}
      <div className="mb-8">
        {subLoading ? (
          <div className="h-32 bg-gray-50 rounded-xl border animate-pulse" />
        ) : (
          <CurrentPlanCard subscription={sub?.data} />
        )}
      </div>

      {/* Interval selector */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-lg font-semibold">Available Plans</h2>
        <div className="inline-flex rounded-lg border bg-gray-50 p-1 gap-0.5">
          {INTERVALS.map(i => (
            <button
              key={i.value}
              onClick={() => setBillingInterval(i.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors min-h-[36px] ${
                interval === i.value
                  ? 'bg-white shadow-sm text-gray-900'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {i.label}
              {i.discount && <span className="ml-1 text-green-600">({i.discount})</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Plans grid */}
      {plansLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-72 bg-gray-50 rounded-xl border animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(plans || []).map((p: any) => (
            <PlanCard
              key={p.code}
              plan={p}
              interval={interval}
              isCurrent={currentPlanCode === p.code}
              onSelect={() => handleSelect(p)}
              busy={busy === p.code}
            />
          ))}
        </div>
      )}

      {/* Pricing notes */}
      <div className="mt-6 text-xs text-gray-400 space-y-1">
        <p>All prices in USD. Longer billing cycles receive automatic discounts.</p>
        <p>Plans can be upgraded or downgraded at any time. Changes take effect at the next billing cycle.</p>
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-64 bg-gray-50 rounded-xl" />}>
      <BillingPageInner />
    </Suspense>
  );
}
