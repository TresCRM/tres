import Link from 'next/link';
import { MapPin, Clock, Briefcase, ArrowRight } from 'lucide-react';

const openings = [
  {
    title: 'Senior Backend Engineer',
    team: 'Platform',
    location: 'Remote',
    type: 'Full-time',
    desc: 'Build and scale our multi-tenant API platform (Node.js, MongoDB, NATS). Own ticket lifecycle, billing, and webhook infrastructure.',
  },
  {
    title: 'Frontend Engineer',
    team: 'Product',
    location: 'Remote',
    type: 'Full-time',
    desc: 'Build console and widget experiences with Next.js, React 19, and TanStack Query. Focus on accessibility, performance, and responsive design.',
  },
  {
    title: 'DevOps / SRE Engineer',
    team: 'Infrastructure',
    location: 'Remote',
    type: 'Full-time',
    desc: 'Manage Kubernetes clusters, CI/CD pipelines, monitoring (OpenTelemetry, Prometheus), and ensure 99.9% uptime SLO.',
  },
  {
    title: 'Product Designer',
    team: 'Design',
    location: 'Remote',
    type: 'Contract',
    desc: 'Design intuitive support workflows, dashboard analytics, and the embeddable widget. WCAG 2.1 AA compliance required.',
  },
];

const perks = [
  'Fully remote — work from anywhere',
  'Competitive salary + equity',
  'Flexible hours, async-first culture',
  'Health & wellness stipend',
  'Learning & conference budget',
  'Latest hardware provided',
];

export default function CareersPage() {
  return (
    <div>
      {/* Hero */}
      <section className="py-20 px-4 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold mb-4">Join TRES CRM</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Help us build the helpdesk platform that SaaS teams actually want to use. Remote-first, async-friendly, and obsessed with quality.
        </p>
      </section>

      {/* Why join */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-center mb-8">Why Work Here</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {perks.map(p => (
              <div key={p} className="flex items-center gap-3 bg-white border rounded-lg px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-[var(--brand-primary,#4F46E5)] shrink-0" />
                <span className="text-sm text-gray-700">{p}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Open positions */}
      <section className="py-20 px-4">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-center mb-2">Open Positions</h2>
          <p className="text-center text-gray-500 text-sm mb-10">Positions managed by admin — check back regularly for updates.</p>
          <div className="space-y-4">
            {openings.map(job => (
              <div key={job.title} className="border rounded-xl p-6 bg-white hover:shadow-md transition-shadow">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <h3 className="font-semibold text-lg">{job.title}</h3>
                  <span className="text-xs font-medium px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-full">{job.team}</span>
                </div>
                <p className="text-sm text-gray-600 mb-4">{job.desc}</p>
                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><MapPin size={13} /> {job.location}</span>
                  <span className="flex items-center gap-1"><Clock size={13} /> {job.type}</span>
                  <span className="flex items-center gap-1"><Briefcase size={13} /> {job.team}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-xl font-bold mb-3">Don't see your role?</h2>
          <p className="text-gray-600 text-sm mb-6">We're always looking for talented people. Send us your resume and we'll keep you in mind.</p>
          <Link href="/contact" className="px-6 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm inline-flex items-center gap-2 min-h-[44px] hover:opacity-90">
            Get in touch <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}
