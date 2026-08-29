'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Check, ArrowRight, X } from 'lucide-react';
import api from '@/lib/api';

type Interval = 'MONTH' | 'QUARTER' | 'SEMIANNUAL' | 'ANNUAL';

const INTERVALS: { value: Interval; label: string; discount?: string }[] = [
  { value: 'MONTH', label: 'Monthly' },
  { value: 'QUARTER', label: 'Quarterly', discount: '5% off' },
  { value: 'SEMIANNUAL', label: '6 months', discount: '10% off' },
  { value: 'ANNUAL', label: 'Annual', discount: '20% off' },
];

const DISCOUNT_FACTOR: Record<Interval, number> = {
  MONTH: 1.0, QUARTER: 0.95, SEMIANNUAL: 0.90, ANNUAL: 0.80,
};
const INTERVAL_MONTHS: Record<Interval, number> = {
  MONTH: 1, QUARTER: 3, SEMIANNUAL: 6, ANNUAL: 12,
};

function formatPrice(cents: number): string {
  if (cents === 0) return '$0';
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toLocaleString()}` : `$${dollars.toFixed(2)}`;
}

// Fallback catalog when API is unavailable
const FALLBACK_PLANS = [
  {
    code: 'FREE', name: 'Free', tagline: 'Professional support for solo operators',
    priceCentsPerSeat: 0, seats: 1, isCustom: false,
    features: ['50 lifetime tickets', 'Basic embeddable widget', 'Email notifications', '10K words per ticket'],
    cta: 'Start free', highlight: false,
  },
  {
    code: 'STARTER', name: 'Starter', tagline: 'Small teams getting organized',
    priceCentsPerSeat: 500, seats: 5, isCustom: false,
    features: ['Unlimited tickets', 'API access', 'Widget customization', 'Basic reports', 'Internal messaging'],
    cta: 'Get started', highlight: false,
  },
  {
    code: 'TEAM', name: 'Team', tagline: 'Growing teams with active support',
    priceCentsPerSeat: 900, seats: 20, isCustom: false,
    features: ['Everything in Starter', 'Live chat (text)', 'Custom fields', 'SLA policies', 'Advanced reports'],
    cta: 'Get started', highlight: true,
  },
  {
    code: 'BUSINESS', name: 'Business', tagline: 'Companies needing branded experience',
    priceCentsPerSeat: 1500, seats: 100, isCustom: false,
    features: ['Everything in Team', 'Video calls (30min)', 'Custom subdomain', 'Branded portal', 'API sandbox'],
    cta: 'Get started', highlight: false,
  },
  {
    code: 'ADVANCED', name: 'Advanced', tagline: 'Organizations wanting AI + enterprise features',
    priceCentsPerSeat: 2500, seats: 500, isCustom: false,
    features: ['Everything in Business', 'AI copilot + triage', 'Knowledge extraction', 'SSO/SAML', 'Priority support'],
    cta: 'Get started', highlight: false,
  },
  {
    code: 'ENTERPRISE', name: 'Enterprise', tagline: 'Large teams with compliance needs',
    priceCentsPerSeat: 0, seats: 1000, isCustom: true,
    features: ['Everything in Advanced', 'Dedicated infrastructure', 'Custom SLA', 'Onboarding concierge', 'Account manager'],
    cta: 'Contact sales', highlight: false,
  },
];

const ADDONS = [
  { name: 'Extra Seat', description: 'Additional team member', price: '$6/seat/mo' },
  { name: 'Custom SMTP Domain', description: 'Branded email delivery', price: '$20/mo' },
  { name: 'Priority Support', description: '1hr response SLA', price: '$149/mo', freeOn: 'Advanced+' },
  { name: 'SSO / SAML', description: 'Enterprise identity', price: '$99/mo', freeOn: 'Advanced+' },
  { name: 'Premium Analytics', description: 'Deep reporting', price: '$99/mo', freeOn: 'Advanced+' },
  { name: 'AI Credits Pack', description: '5,000 credits/mo', price: '$49/mo', freeOn: 'Advanced+' },
  { name: 'Video Minutes Pack', description: '300 extra minutes', price: '$29/mo' },
];

const COMPARISON = [
  { feature: 'Unlimited tickets', plans: [false, true, true, true, true, true] },
  { feature: 'API access', plans: [false, true, true, true, true, true] },
  { feature: 'Live chat', plans: [false, false, true, true, true, true] },
  { feature: 'Custom fields', plans: [false, false, true, true, true, true] },
  { feature: 'SLA policies', plans: [false, false, true, true, true, true] },
  { feature: 'Video calls', plans: [false, false, false, true, true, true] },
  { feature: 'Custom subdomain', plans: [false, false, false, true, true, true] },
  { feature: 'AI copilot', plans: [false, false, false, false, true, true] },
  { feature: 'SSO / SAML', plans: [false, false, false, false, true, true] },
  { feature: 'Dedicated infra', plans: [false, false, false, false, false, true] },
];

export default function PricingPage() {
  const [interval, setInterval] = useState<Interval>('MONTH');
  const [plans, setPlans] = useState<any[]>(FALLBACK_PLANS);

  useEffect(() => {
    api.get('/subscriptions/plans')
      .then(res => {
        if (res.data.data && Array.isArray(res.data.data)) {
          const apiPlans = res.data.data
            .filter((p: any) => !p.isLegacy)
            .map((p: any) => {
              const fallback = FALLBACK_PLANS.find(f => f.code === p.code);
              return {
                code: p.code,
                name: p.name,
                tagline: p.tagline || fallback?.tagline,
                priceCentsPerSeat: p.priceCentsPerSeat ?? fallback?.priceCentsPerSeat ?? 0,
                seats: p.seats,
                isCustom: p.isCustom || false,
                features: fallback?.features || [],
                cta: p.isCustom ? 'Contact sales' : p.priceCentsPerSeat === 0 ? 'Start free' : 'Get started',
                highlight: p.code === 'TEAM',
              };
            });
          if (apiPlans.length > 0) setPlans(apiPlans);
        }
      })
      .catch(() => {}); // use fallback
  }, []);

  const calcPrice = (plan: any) => {
    if (plan.isCustom) return 'Custom';
    if (plan.priceCentsPerSeat === 0) return '$0';
    const months = INTERVAL_MONTHS[interval];
    const factor = DISCOUNT_FACTOR[interval];
    const perMonth = (plan.priceCentsPerSeat * factor) / 100;
    return perMonth % 1 === 0 ? `$${perMonth}` : `$${perMonth.toFixed(2)}`;
  };

  return (
    <div>
      {/* Header */}
      <section className="py-16 px-4 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">Pricing that makes sense</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          No hidden fees. No per-ticket charges. No enterprise ransom. Start free, scale to any size.
        </p>
      </section>

      {/* Interval toggle */}
      <section className="px-4 mb-10">
        <div className="max-w-md mx-auto bg-gray-100 rounded-lg p-1 flex">
          {INTERVALS.map(i => (
            <button
              key={i.value}
              onClick={() => setInterval(i.value)}
              className={`flex-1 px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors min-h-[40px] ${
                interval === i.value ? 'bg-white shadow-sm text-gray-900' : 'text-gray-600'
              }`}
            >
              {i.label}
              {i.discount && <span className="ml-1 text-green-600 text-[10px] sm:text-xs">{i.discount}</span>}
            </button>
          ))}
        </div>
      </section>

      {/* Plans grid */}
      <section className="px-4 pb-16">
        <div className="mx-auto max-w-7xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {plans.map(p => (
            <div key={p.code} className={`rounded-xl border-2 p-5 flex flex-col ${p.highlight ? 'border-[var(--brand-primary,#4F46E5)] shadow-lg relative' : 'border-gray-200'}`}>
              {p.highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--brand-primary,#4F46E5)] text-white text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap">Most popular</div>}
              <h3 className="font-semibold text-base">{p.name}</h3>
              {p.tagline && <p className="text-xs text-gray-500 mt-1 mb-3 min-h-[32px]">{p.tagline}</p>}
              <div className="mb-3">
                <span className="text-2xl font-bold">{calcPrice(p)}</span>
                {!p.isCustom && p.priceCentsPerSeat > 0 && <span className="text-xs text-gray-500">/seat/mo</span>}
                {p.priceCentsPerSeat === 0 && !p.isCustom && <span className="text-xs text-gray-500"> forever</span>}
              </div>
              <p className="text-xs text-gray-500 mb-3">Up to {p.seats} seats</p>
              <ul className="space-y-1.5 mb-5 flex-1">
                {p.features.map((f: string) => (
                  <li key={f} className="text-xs text-gray-700 flex items-start gap-1.5">
                    <Check size={12} className="text-green-500 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={p.isCustom ? '/contact' : '/signup'}
                className={`block text-center px-3 py-2 rounded-lg font-medium text-xs min-h-[40px] leading-[24px] ${
                  p.highlight ? 'bg-[var(--brand-primary,#4F46E5)] text-white hover:opacity-90' : 'border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* The math that sells itself */}
      <section className="py-16 px-4 bg-gradient-to-br from-indigo-50 to-purple-50">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-6">The math that sells itself</h2>
          <div className="bg-white rounded-xl border p-6 sm:p-8 text-left space-y-3">
            <p className="text-sm text-gray-600">Typical support stack cost:</p>
            <ul className="text-sm space-y-1 text-gray-700">
              <li>Zendesk: <span className="font-mono">$55/agent/month</span></li>
              <li>Intercom: <span className="font-mono">$74/agent/month</span></li>
              <li>HubSpot: <span className="font-mono">$45/agent/month</span></li>
            </ul>
            <div className="border-t pt-3">
              <p className="text-sm text-gray-500">Total: <span className="font-bold text-gray-900">$174/agent/month</span></p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-4">
              <p className="text-sm text-green-900">
                <span className="font-bold">TRES CRM Business:</span> <span className="font-mono text-lg">$15/agent/month</span>
              </p>
              <p className="text-xs text-green-700 mt-1">
                For a 10-person team: <span className="font-bold">$1,590/month saved</span> — that&apos;s <span className="font-bold">$19,080/year</span> back in your pocket.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Add-ons */}
      <section className="py-16 px-4">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-3">Usage-based add-ons</h2>
          <p className="text-center text-gray-600 mb-10">Extend any plan with optional features</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {ADDONS.map(a => (
              <div key={a.name} className="border rounded-lg p-4 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm">{a.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{a.description}</p>
                    {a.freeOn && <p className="text-xs text-green-600 mt-1">Free on {a.freeOn}</p>}
                  </div>
                  <span className="font-semibold text-sm whitespace-nowrap">{a.price}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature comparison */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">Compare plans</h2>
          <div className="overflow-x-auto">
            <table className="w-full bg-white border rounded-xl text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Feature</th>
                  {['Free', 'Starter', 'Team', 'Business', 'Advanced', 'Enterprise'].map(n => (
                    <th key={n} className="p-3 font-medium text-center text-xs">{n}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map(row => (
                  <tr key={row.feature} className="border-b last:border-0">
                    <td className="p-3 text-gray-700">{row.feature}</td>
                    {row.plans.map((v, i) => (
                      <td key={i} className="p-3 text-center">
                        {v ? <Check size={16} className="text-green-500 mx-auto" /> : <X size={14} className="text-gray-300 mx-auto" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to scale your support?</h2>
          <p className="text-lg text-gray-600 mb-8">Start free. No credit card. Deploy in 60 seconds.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/signup" className="px-8 py-3.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-semibold text-base hover:opacity-90 min-h-[48px] inline-flex items-center justify-center gap-2">
              Start Free <ArrowRight size={18} />
            </Link>
            <Link href="/contact" className="px-8 py-3.5 border-2 border-gray-300 rounded-lg font-semibold text-base hover:border-gray-400 min-h-[48px] inline-flex items-center justify-center">
              Contact Sales
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
