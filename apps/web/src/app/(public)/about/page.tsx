import { Shield, Globe, Zap, Heart } from 'lucide-react';

const values = [
  { icon: Shield, title: 'Security First', desc: 'OWASP-aligned security practices, encrypted data at rest, RBAC with 22 granular permissions, and JWT with separate access/refresh token rotation.' },
  { icon: Globe, title: 'Built for Scale', desc: 'From solo operators to 1000+ seat enterprise teams. Multi-tenant architecture with per-tenant isolation, horizontal scaling, and 99.9% uptime SLO.' },
  { icon: Zap, title: 'Developer Experience', desc: 'Full REST API with scoped API keys, HMAC-signed webhooks, embeddable widget, and OpenAPI 3.0 documentation. Build integrations in minutes.' },
  { icon: Heart, title: 'Customer Obsessed', desc: 'White-label branding, CSAT/NPS surveys on ticket close, customer portal with magic links, and real-time collaboration via WebSocket.' },
];

const milestones = [
  { year: '2025', event: 'TRES CRM founded with a mission to democratize enterprise-grade customer support.' },
  { year: '2025', event: 'Core platform launched: ticketing, billing, surveys, real-time collaboration.' },
  { year: '2026', event: 'External API, embeddable widget, and add-on marketplace launched.' },
  { year: '2026', event: 'Expanded to 8 pricing tiers with free tier (50 lifetime tickets).' },
];

export default function AboutPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-20 px-4 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">About TRES CRM</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          We build the helpdesk platform that SaaS teams deserve — branded, API-first, and priced for growth. Not another bloated enterprise tool.
        </p>
      </section>

      {/* Mission */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold mb-4">Our Mission</h2>
          <p className="text-gray-600 leading-relaxed">
            Every business deserves world-class customer support tools without the enterprise price tag.
            TRES CRM provides a multi-tenant, white-label helpdesk platform that scales from individual
            professionals to 1000+ seat teams — with full API access, real-time collaboration, and
            automated surveys at every tier.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-bold text-center mb-12">What We Stand For</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {values.map(v => (
              <div key={v.title} className="flex gap-4">
                <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                  <v.icon size={24} className="text-[var(--brand-primary,#4F46E5)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-lg mb-1">{v.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{v.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-bold text-center mb-12">Our Journey</h2>
          <div className="space-y-6">
            {milestones.map((m, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-16 shrink-0 text-right">
                  <span className="text-sm font-bold text-[var(--brand-primary,#4F46E5)]">{m.year}</span>
                </div>
                <div className="w-px bg-gray-300 shrink-0 relative">
                  <div className="absolute top-1 -left-1 w-2.5 h-2.5 rounded-full bg-[var(--brand-primary,#4F46E5)]" />
                </div>
                <p className="text-sm text-gray-600 pb-2">{m.event}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team placeholder */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold mb-4">The Team</h2>
          <p className="text-gray-600 mb-8">A small, focused team building the next generation of customer support tools.</p>
          <p className="text-sm text-gray-400 italic">Team profiles managed by admin — content coming soon.</p>
        </div>
      </section>
    </div>
  );
}
