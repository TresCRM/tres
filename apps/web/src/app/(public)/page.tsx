import Link from 'next/link';
import {
  Ticket, MessageSquare, Brain, Code, Globe, BarChart3,
  ArrowRight, Zap, Shield, Check, X, TrendingUp, Clock, Users, Sparkles,
} from 'lucide-react';

// ─── Content from MARKETING.md ─────────────────────

const hookStats = [
  { value: '67%', label: 'Customers leave after a bad support experience' },
  { value: '4.2', label: 'Average tools businesses use to manage customers' },
  { value: '$200+', label: 'Per agent per month across tool sprawl' },
];

const ahaMoments = [
  {
    icon: Zap,
    title: 'Widget in 60 Seconds',
    description: 'Paste one line of code. Your website now has professional live chat and support ticket creation — branded, online/offline, ready for your customers.',
    highlight: '<script src="cdn.trescrm.com/widget.js">',
  },
  {
    icon: Brain,
    title: 'AI That Actually Helps',
    description: 'AI classifies priority on new tickets, suggests responses to agents, and emails you weekly: "Billing complaints up 30%. Here\'s what customers are saying."',
    highlight: 'Saves agents 2 hours per day',
  },
  {
    icon: Users,
    title: 'Your Customers Get a Dashboard',
    description: 'Every tenant\'s customers get a branded portal: track tickets in real-time, create new ones, complete surveys, access your knowledge base.',
    highlight: 'Stop answering "where\'s my ticket?"',
  },
  {
    icon: Code,
    title: 'Every Button Has an API',
    description: 'Anything you can do in the dashboard, you can do via API. 25+ webhooks. Auto-create tickets from Stripe failures, Shopify orders, anywhere.',
    highlight: 'Not software — infrastructure',
  },
  {
    icon: Clock,
    title: 'Transparent Support Timeline',
    description: 'Your customers see exactly what happened with their ticket: when received, assigned, every response, SLA commitments — resolution and follow-up.',
    highlight: 'Eliminates 60% of status checks',
  },
];

const features = [
  { title: 'Ticketing Engine', desc: '8-state lifecycle with SLA tracking, smart auto-close, priority matrix, merge duplicates, custom fields, templates.', icon: Ticket },
  { title: 'Live Chat & Widget', desc: 'Real-time text chat, WebRTC video calls, offline capture, tenant branding, plugins for WordPress/Shopify/React/Vue.', icon: MessageSquare },
  { title: 'AI Intelligence', desc: 'Auto-triage, suggested replies, ticket summaries, knowledge extraction, anomaly detection, manager copilot.', icon: Brain },
  { title: 'Developer Platform', desc: 'Sandbox + production environments, 31 webhook events, typed SDKs, interactive API explorer, Postman collection.', icon: Code },
  { title: 'Analytics & Reporting', desc: 'Real-time ticket ops, agent scorecards, customer intelligence, scheduled exports (CSV/XLSX/PDF), API access.', icon: BarChart3 },
  { title: 'Security & Compliance', desc: 'JWT + MFA + SSO/SAML, AES-256 encryption, RBAC with 22 permissions, ClamAV scanning, GDPR workflows, SOC2 ready.', icon: Shield },
];

const testimonials = [
  {
    quote: 'We replaced three tools with TRES CRM and our first response time dropped from 8 hours to 47 minutes.',
    author: 'Growth-stage SaaS founder',
  },
  {
    quote: 'The widget took 30 seconds to install. Our first customer ticket came in within the hour.',
    author: 'E-commerce store owner',
  },
  {
    quote: 'Our agents love the AI suggestions. It\'s like having a senior support lead whispering the right answer.',
    author: 'Support team manager',
  },
  {
    quote: 'We embedded ticket creation into our payment failure flow via the API. Customers now get automatic support when charges fail.',
    author: 'Fintech CTO',
  },
  {
    quote: 'The transparent ticket timeline is a game-changer. Our customers stopped calling to ask "what\'s the status" because they can see it themselves.',
    author: 'Customer success director',
  },
];

const competitive = [
  { feature: 'Ticketing',          trescrm: 'Strong',         zendesk: 'Strong',      intercom: 'Weak',     freshdesk: 'Strong' },
  { feature: 'Live chat',          trescrm: 'Built-in',       zendesk: 'Add-on',      intercom: 'Strong',   freshdesk: 'Add-on' },
  { feature: 'Video calls',        trescrm: 'Yes (Business+)', zendesk: 'No',          intercom: 'No',       freshdesk: 'No' },
  { feature: 'AI copilot',         trescrm: 'Built-in',       zendesk: 'Add-on $$$',  intercom: 'Add-on',   freshdesk: 'Basic' },
  { feature: 'Customer portal',    trescrm: 'Built-in',       zendesk: 'Add-on',      intercom: 'No',       freshdesk: 'Basic' },
  { feature: 'API parity',         trescrm: '100%',           zendesk: 'Partial',     intercom: 'Partial',  freshdesk: 'Partial' },
  { feature: 'Webhook events',     trescrm: '31',             zendesk: '10-15',       intercom: '10-15',    freshdesk: '10-15' },
  { feature: 'Free plan',          trescrm: 'Yes',            zendesk: 'No',          intercom: 'No',       freshdesk: 'Limited' },
  { feature: 'Price/seat',         trescrm: '$5',             zendesk: '$55',         intercom: '$74',      freshdesk: '$15' },
];

export default function LandingPage() {
  return (
    <div>
      {/* ═══════════ SLIDE 1: THE HOOK ═══════════ */}
      <section className="py-20 sm:py-28 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium bg-indigo-50 text-indigo-700 rounded-full mb-6">
            <Sparkles size={12} /> AI-powered customer operations platform
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 mb-6">
            Your customers deserve better than a <span className="text-[var(--brand-primary,#4F46E5)]">shared inbox</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-10">
            One platform. Every customer touchpoint. Zero tool sprawl.
            <br className="hidden sm:block" />
            Start free. Scale infinitely. Own every interaction.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup" className="px-8 py-3.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-semibold text-base hover:opacity-90 transition-opacity min-h-[48px] inline-flex items-center justify-center gap-2">
              Start Free — No Credit Card <ArrowRight size={18} />
            </Link>
            <Link href="/pricing" className="px-8 py-3.5 border-2 border-gray-300 rounded-lg font-semibold text-base hover:border-gray-400 min-h-[48px] inline-flex items-center justify-center">
              View Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════════ SLIDE 3: THE PROBLEM ═══════════ */}
      <section className="border-y bg-red-50/40 py-16 px-4">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">The modern support stack is broken</h2>
            <p className="text-lg text-gray-600">Every day, businesses lose customers not because their product failed — but because their support did.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6 mb-10">
            {hookStats.map(s => (
              <div key={s.label} className="bg-white border rounded-xl p-6 text-center">
                <div className="text-4xl font-bold text-red-600 mb-2">{s.value}</div>
                <p className="text-sm text-gray-600">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="bg-gray-50 p-4 border-b text-center">
              <p className="text-sm font-medium text-gray-700">Total cost of tool sprawl: <span className="text-red-600 font-bold">$200-400/agent/month across 4-5 tools</span></p>
            </div>
            <div className="p-6 text-center">
              <p className="text-sm text-gray-600 mb-4">Five logins. Five data silos. Zero unified view.</p>
              <div className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--brand-primary,#4F46E5)]">
                <TrendingUp size={20} /> TRES CRM replaces the entire stack — from $5/seat/month
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════ SLIDE 5: AHA MOMENTS ═══════════ */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">Five things that make people say &quot;I need this&quot;</h2>
            <p className="text-gray-500 max-w-2xl mx-auto">Not hype. Not marketing fluff. Features that actually save hours and win customers.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ahaMoments.map(m => (
              <div key={m.title} className="border rounded-xl p-6 hover:shadow-lg transition-shadow bg-white group">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center mb-4 group-hover:bg-indigo-100 transition-colors">
                  <m.icon size={22} className="text-[var(--brand-primary,#4F46E5)]" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{m.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-3">{m.description}</p>
                <div className="inline-block bg-indigo-50 text-indigo-700 text-xs font-medium px-2 py-1 rounded">{m.highlight}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ SLIDE 6: FEATURE SHOWCASE ═══════════ */}
      <section className="py-20 px-4 bg-gray-50" id="features">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">Everything you need. Nothing you don&apos;t.</h2>
          <p className="text-center text-gray-500 mb-12 max-w-2xl mx-auto">Six modules. One platform. Zero tool sprawl.</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(f => (
              <div key={f.title} className="border rounded-xl p-6 bg-white hover:shadow-md transition-shadow">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center mb-4">
                  <f.icon size={22} className="text-[var(--brand-primary,#4F46E5)]" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ SLIDE 11: TESTIMONIALS ═══════════ */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-3">What customers are saying</h2>
          <p className="text-center text-gray-500 mb-12">Real words from teams using TRES CRM every day</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <blockquote key={i} className={`border rounded-xl p-6 bg-white ${i === 0 ? 'md:col-span-2 lg:col-span-1' : ''}`}>
                <p className="text-sm text-gray-700 leading-relaxed italic mb-4">&ldquo;{t.quote}&rdquo;</p>
                <footer className="text-xs text-gray-500 font-medium">— {t.author}</footer>
              </blockquote>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ SLIDE 12: COMPETITIVE POSITIONING ═══════════ */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-3">Why TRES CRM wins head-to-head</h2>
          <p className="text-center text-gray-500 mb-10">Side-by-side comparison with the tools businesses leave behind</p>
          <div className="bg-white border rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-4 font-medium">Capability</th>
                  <th className="text-center p-4 font-medium text-gray-500">Zendesk</th>
                  <th className="text-center p-4 font-medium text-gray-500">Intercom</th>
                  <th className="text-center p-4 font-medium text-gray-500">Freshdesk</th>
                  <th className="text-center p-4 font-bold text-[var(--brand-primary,#4F46E5)] bg-indigo-50">TRES CRM</th>
                </tr>
              </thead>
              <tbody>
                {competitive.map(row => (
                  <tr key={row.feature} className="border-b last:border-0">
                    <td className="p-4 font-medium text-gray-700">{row.feature}</td>
                    <td className="p-4 text-center text-gray-500 text-xs">{row.zendesk}</td>
                    <td className="p-4 text-center text-gray-500 text-xs">{row.intercom}</td>
                    <td className="p-4 text-center text-gray-500 text-xs">{row.freshdesk}</td>
                    <td className="p-4 text-center bg-indigo-50 text-[var(--brand-primary,#4F46E5)] font-semibold text-xs">{row.trescrm}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ═══════════ SLIDE 13: THE ASK ═══════════ */}
      <section className="py-24 px-4">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="text-3xl sm:text-5xl font-bold mb-6">
            Start today. Ship <span className="text-[var(--brand-primary,#4F46E5)]">this afternoon</span>.
          </h2>
          <p className="text-lg text-gray-600 mb-10 max-w-2xl mx-auto">
            Sign up free. Deploy your widget in 60 seconds. Get your first ticket in 5 minutes.
            No credit card. No time limit. No catch.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup" className="px-8 py-4 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-semibold text-base hover:opacity-90 min-h-[52px] inline-flex items-center justify-center gap-2">
              Start Free <ArrowRight size={18} />
            </Link>
            <Link href="/docs" className="px-8 py-4 border-2 border-gray-300 rounded-lg font-semibold text-base hover:border-gray-400 min-h-[52px] inline-flex items-center justify-center">
              Explore the API
            </Link>
            <Link href="/partners" className="px-8 py-4 border-2 border-gray-300 rounded-lg font-semibold text-base hover:border-gray-400 min-h-[52px] inline-flex items-center justify-center">
              Become a Partner
            </Link>
          </div>
          <div className="mt-16 border-t pt-10">
            <p className="text-sm text-gray-500 italic">
              &ldquo;The most customer-centric support infrastructure — online, offline, and everywhere in between.&rdquo;
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
