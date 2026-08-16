'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, ArrowRight, Copy, Check, Loader2, Building2, Users, Code, Palette } from 'lucide-react';

const STEPS = ['Workspace', 'Industry', 'Team', 'Widget'];

export default function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [workspaceName, setWorkspaceName] = useState('');
  const [selectedPack, setSelectedPack] = useState('');
  const [inviteEmails, setInviteEmails] = useState('');
  const [copied, setCopied] = useState(false);

  const widgetCode = '<script src="https://cdn.trescrm.com/widget.js" data-token="YOUR_TOKEN"></script>';

  const copyCode = () => {
    navigator.clipboard.writeText(widgetCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const packs = [
    { slug: 'ecommerce', name: 'E-commerce', icon: '🛒' },
    { slug: 'saas', name: 'SaaS / Tech', icon: '💻' },
    { slug: 'fintech', name: 'Fintech', icon: '🏦' },
    { slug: 'healthcare', name: 'Healthcare', icon: '🏥' },
    { slug: 'professional-services', name: 'Professional Services', icon: '💼' },
    { slug: 'education', name: 'Education', icon: '🎓' },
    { slug: 'logistics', name: 'Logistics', icon: '🚚' },
  ];

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold text-center mb-2">Set Up Your Workspace</h1>
      <p className="text-gray-500 text-center mb-8">Get started in under 3 minutes</p>

      {/* Progress bar */}
      <div className="flex items-center justify-center gap-2 mb-10">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              i < step ? 'bg-green-500 text-white' : i === step ? 'bg-[var(--brand-primary,#4F46E5)] text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {i < step ? <CheckCircle size={16} /> : i + 1}
            </div>
            <span className={`text-sm hidden sm:inline ${i === step ? 'font-medium' : 'text-gray-400'}`}>{s}</span>
            {i < STEPS.length - 1 && <div className="w-8 h-0.5 bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Step 1: Workspace */}
      {step === 0 && (
        <div className="border rounded-xl bg-white p-8 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Building2 size={24} className="text-[var(--brand-primary,#4F46E5)]" />
            <h2 className="text-lg font-medium">Name Your Workspace</h2>
          </div>
          <div>
            <label htmlFor="ws-name" className="block text-sm font-medium mb-1">Workspace Name</label>
            <input id="ws-name" value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} className="w-full border rounded-md px-3 py-2.5 text-sm" placeholder="My Company" />
          </div>
          <button onClick={() => setStep(1)} disabled={!workspaceName.trim()} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm min-h-[44px]">
            Continue <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* Step 2: Industry */}
      {step === 1 && (
        <div className="border rounded-xl bg-white p-8 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Palette size={24} className="text-[var(--brand-primary,#4F46E5)]" />
            <h2 className="text-lg font-medium">Choose Your Industry</h2>
          </div>
          <p className="text-sm text-gray-500">Select a starter pack to pre-configure templates and SLA targets.</p>
          <div className="grid grid-cols-2 gap-2">
            {packs.map(p => (
              <button key={p.slug} onClick={() => setSelectedPack(p.slug)} className={`text-left p-3 border rounded-lg text-sm transition-colors ${selectedPack === p.slug ? 'border-[var(--brand-primary,#4F46E5)] bg-indigo-50' : 'hover:bg-gray-50'}`}>
                <span className="text-lg mr-2">{p.icon}</span>{p.name}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(2)} className="flex-1 px-4 py-2.5 border rounded-lg text-sm text-gray-500 min-h-[44px]">Skip</button>
            <button onClick={() => setStep(2)} disabled={!selectedPack} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm min-h-[44px]">
              Apply Pack <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Team */}
      {step === 2 && (
        <div className="border rounded-xl bg-white p-8 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Users size={24} className="text-[var(--brand-primary,#4F46E5)]" />
            <h2 className="text-lg font-medium">Invite Your Team</h2>
          </div>
          <div>
            <label htmlFor="invite-emails" className="block text-sm font-medium mb-1">Email addresses (one per line)</label>
            <textarea id="invite-emails" value={inviteEmails} onChange={e => setInviteEmails(e.target.value)} rows={3} className="w-full border rounded-md px-3 py-2.5 text-sm" placeholder={"agent1@company.com\nagent2@company.com"} />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStep(3)} className="flex-1 px-4 py-2.5 border rounded-lg text-sm text-gray-500 min-h-[44px]">Skip for now</button>
            <button onClick={() => setStep(3)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm min-h-[44px]">
              {inviteEmails.trim() ? 'Send Invites' : 'Continue'} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Widget */}
      {step === 3 && (
        <div className="border rounded-xl bg-white p-8 space-y-4">
          <div className="flex items-center gap-3 mb-4">
            <Code size={24} className="text-[var(--brand-primary,#4F46E5)]" />
            <h2 className="text-lg font-medium">Install Your Widget</h2>
          </div>
          <p className="text-sm text-gray-500">Add this one line of code to your website to enable live support.</p>
          <div className="relative">
            <code className="block bg-gray-900 text-green-400 rounded-lg p-4 text-xs font-mono overflow-x-auto">{widgetCode}</code>
            <button onClick={copyCode} className="absolute top-2 right-2 p-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <button onClick={() => router.push('/dashboard')} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium text-sm min-h-[44px]">
            <CheckCircle size={16} /> Go to Dashboard
          </button>
        </div>
      )}
    </div>
  );
}
