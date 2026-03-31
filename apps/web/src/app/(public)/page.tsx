import Link from 'next/link';
import { Ticket, Building2, UserCircle, Users, Link2, BarChart3, ArrowRight, Zap, Shield, Globe } from 'lucide-react';

const features = [
  { title: 'Ticket Management', desc: 'Create, assign, track, and resolve support tickets with SLA tracking and assignment history.', icon: Ticket },
  { title: 'Multi-Tenant', desc: 'Each business gets its own branded workspace with custom logo, colors, and email templates.', icon: Building2 },
  { title: 'Customer Portal', desc: 'Customers submit and track tickets via embeddable widget or magic link — no login required.', icon: UserCircle },
  { title: 'Team Management', desc: 'Invite agents, assign roles (Owner, Admin, Agent, Billing), enforce seat limits per plan.', icon: Users },
  { title: 'API & Webhooks', desc: 'Full REST API with scoped API keys. Webhooks with HMAC signatures for real-time integrations.', icon: Link2 },
  { title: 'Surveys & NPS', desc: 'Auto-send CSAT surveys on ticket close. Track NPS scores and response analytics.', icon: BarChart3 },
];

const stats = [
  { value: '99.9%', label: 'Uptime SLO', icon: Zap },
  { value: '<300ms', label: 'API p95', icon: Globe },
  { value: '8', label: 'Plans', icon: Shield },
  { value: '275+', label: 'Tests', icon: Shield },
];

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-20 sm:py-28 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-full mb-6">
            <Zap size={12} /> Now with embeddable widget &amp; external API
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 mb-6">
            Customer support that<br />
            <span className="text-[var(--brand-primary,#4F46E5)]">scales with your business</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10">
            TRES CRM is a multi-tenant helpdesk platform with ticketing, billing, surveys, real-time collaboration, and white-label branding. From solo operators to 1000+ seat teams.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup" className="px-8 py-3.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-semibold text-base hover:opacity-90 transition-opacity min-h-[48px] inline-flex items-center justify-center gap-2">
              Start free — 50 tickets included <ArrowRight size={18} />
            </Link>
            <Link href="/pricing" className="px-8 py-3.5 border-2 border-gray-300 rounded-lg font-semibold text-base hover:border-gray-400 transition-colors min-h-[48px] inline-flex items-center justify-center">
              View pricing
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y bg-gray-50 py-12 px-4">
        <div className="mx-auto max-w-5xl grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {stats.map(s => (
            <div key={s.label} className="flex flex-col items-center">
              <s.icon size={20} className="text-[var(--brand-primary,#4F46E5)] mb-2" />
              <div className="text-3xl font-bold text-gray-900">{s.value}</div>
              <div className="text-sm text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4" id="features">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-4">Everything you need to support customers</h2>
          <p className="text-center text-gray-500 mb-12 max-w-2xl mx-auto">Built for SaaS teams who want a branded, API-first helpdesk without the enterprise price tag.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map(f => (
              <div key={f.title} className="border rounded-xl p-6 hover:shadow-lg transition-shadow bg-white group">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center mb-4 group-hover:bg-indigo-100 transition-colors">
                  <f.icon size={22} className="text-[var(--brand-primary,#4F46E5)]" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-3xl font-bold text-center mb-12">Get started in 3 steps</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: '1', title: 'Sign up', desc: 'Create your tenant in 60 seconds. Free tier includes 50 tickets.' },
              { step: '2', title: 'Configure', desc: 'Set your branding, invite your team, connect your email.' },
              { step: '3', title: 'Go live', desc: 'Embed the widget on your site or integrate via API. Start resolving.' },
            ].map(s => (
              <div key={s.step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-[var(--brand-primary,#4F46E5)] text-white flex items-center justify-center font-bold text-lg mx-auto mb-4">{s.step}</div>
                <h3 className="font-semibold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-gray-600">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold mb-4">Ready to streamline your support?</h2>
          <p className="text-gray-600 mb-8">Join businesses using TRES CRM to deliver faster, branded customer support.</p>
          <Link href="/signup" className="px-8 py-3.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-semibold text-base hover:opacity-90 transition-opacity min-h-[48px] inline-flex items-center justify-center gap-2">
            Get started for free <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
}
