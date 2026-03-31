import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';

const plans = [
  { code: 'FREE', name: 'Free', price: '$0', period: 'forever', seats: '1 seat', features: ['50 lifetime tickets', 'Basic support', 'Email notifications'], cta: 'Start free', highlight: false },
  { code: 'IND-1', name: 'Individual', price: '$9', period: '/month', seats: '1 seat', features: ['Unlimited tickets', 'API access', 'Real-time updates', 'Email templates', 'Prepay: 3mo $25, 6mo $48, 12mo $90'], cta: 'Get started', highlight: false },
  { code: 'CO-20', name: 'Company 20', price: '$199', period: '/month', seats: '20 seats', features: ['Everything in Individual', 'Analytics dashboard', 'Team management', 'Customer portal'], cta: 'Get started', highlight: true },
  { code: 'CO-50', name: 'Company 50', price: '$449', period: '/month', seats: '50 seats', features: ['Everything in Company 20', 'SSO/SAML', 'Priority support'], cta: 'Get started', highlight: false },
  { code: 'CO-100', name: 'Company 100', price: '$799', period: '/month', seats: '100 seats', features: ['Everything in Company 50', 'Dedicated account manager'], cta: 'Contact sales', highlight: false },
];

const addons = [
  { name: 'Extra Seat', price: '$6/mo per seat' },
  { name: 'Dedicated SMTP Domain', price: '$20/mo' },
  { name: 'Priority Support', price: '$149/mo' },
  { name: 'SSO/SAML', price: '$99/mo' },
  { name: 'Premium Analytics', price: '$99/mo' },
];

export default function PricingPage() {
  return (
    <div>
      {/* Header */}
      <section className="py-16 px-4 text-center">
        <h1 className="text-4xl font-bold mb-4">Simple, transparent pricing</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">Start free with 50 tickets. Scale to 1000+ seats with volume pricing. No hidden fees.</p>
      </section>

      {/* Plans grid */}
      <section className="px-4 pb-16">
        <div className="mx-auto max-w-6xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {plans.map(p => (
            <div key={p.code} className={`rounded-xl border-2 p-6 flex flex-col ${p.highlight ? 'border-[var(--brand-primary,#4F46E5)] shadow-lg relative' : 'border-gray-200'}`}>
              {p.highlight && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--brand-primary,#4F46E5)] text-white text-xs font-semibold px-3 py-1 rounded-full">Most popular</div>}
              <h3 className="font-semibold text-lg">{p.name}</h3>
              <div className="mt-3 mb-1">
                <span className="text-3xl font-bold">{p.price}</span>
                <span className="text-sm text-gray-500">{p.period}</span>
              </div>
              <p className="text-sm text-gray-500 mb-4">{p.seats}</p>
              <ul className="space-y-2 mb-6 flex-1">
                {p.features.map(f => (
                  <li key={f} className="text-sm text-gray-600 flex items-start gap-2">
                    <Check size={14} className="text-green-500 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className={`block text-center px-4 py-2.5 rounded-lg font-medium text-sm min-h-[44px] leading-[44px] ${
                p.highlight
                  ? 'bg-[var(--brand-primary,#4F46E5)] text-white hover:opacity-90'
                  : 'border border-gray-300 hover:bg-gray-50'
              }`}>
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Larger plans */}
      <section className="px-4 pb-16">
        <div className="mx-auto max-w-3xl text-center border rounded-xl p-8 bg-gray-50">
          <h2 className="text-xl font-semibold mb-2">Need 250+ seats?</h2>
          <p className="text-gray-600 text-sm mb-4">
            Company 250 ($1,699/mo) &middot; Company 500 ($2,999/mo) &middot; Company 1000+ (custom)
          </p>
          <Link href="/contact" className="px-6 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm inline-flex items-center gap-2 min-h-[44px] leading-[44px]">
            Contact sales <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      {/* Add-ons */}
      <section className="px-4 pb-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-center mb-8">Add-ons</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {addons.map(a => (
              <div key={a.name} className="border rounded-lg p-4 flex justify-between items-center">
                <span className="font-medium text-sm">{a.name}</span>
                <span className="text-sm text-gray-500">{a.price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Billing details */}
      <section className="px-4 pb-16">
        <div className="mx-auto max-w-3xl text-center text-sm text-gray-500">
          <p>All plans billed monthly. Prepay 3/6/12 months for up to 17% discount.</p>
          <p className="mt-1">7-day grace period on failed payments. Pro-rata refund within 7 days on annual plans.</p>
        </div>
      </section>
    </div>
  );
}
