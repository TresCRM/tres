'use client';

import { useState, useEffect } from 'react';
import { Loader2, Save, RotateCcw, Check, X, Crown, Zap } from 'lucide-react';
import api from '@/lib/api';

interface Plan {
  code: string;
  name: string;
  tagline?: string;
  seats: number;
  priceCentsPerSeat: number;
  priceCentsMonthly: number;
  active: boolean;
  isCustom?: boolean;
  isLegacy?: boolean;
  _override?: boolean;
  entitlements: Record<string, any>;
}

const ENTITLEMENT_LABELS: Record<string, string> = {
  sso: 'SSO / SAML',
  analytics: 'Analytics',
  api: 'API Access',
  realtime: 'Real-time',
  liveChat: 'Live Chat',
  videoCalls: 'Video Calls',
  aiFeatures: 'AI Features',
  customSubdomain: 'Custom Subdomain',
  brandedPortal: 'Branded Portal',
  customFields: 'Custom Fields',
  slaPolicies: 'SLA Policies',
  internalMessaging: 'Internal Messaging',
  prioritySupport: 'Priority Support',
};

function formatPrice(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

export default function AdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [addons, setAddons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const loadPlans = () => {
    setLoading(true);
    api.get('/admin/plans').then(res => {
      setPlans(res.data.data.plans || []);
      setAddons(res.data.data.addons || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  };

  useEffect(() => { loadPlans(); }, []);

  const startEdit = (plan: Plan) => {
    setEditing(plan.code);
    setForm({
      name: plan.name,
      tagline: plan.tagline || '',
      priceCentsPerSeat: plan.priceCentsPerSeat,
      priceCentsMonthly: plan.priceCentsMonthly,
      seats: plan.seats,
      active: plan.active,
      isCustom: plan.isCustom || false,
      entitlements: { ...plan.entitlements },
    });
  };

  const cancelEdit = () => { setEditing(null); setForm({}); };

  const handleSave = async (code: string) => {
    setSaving(true);
    try {
      await api.put(`/admin/plans/${code}`, form);
      setSaved(code);
      setEditing(null);
      loadPlans();
      setTimeout(() => setSaved(null), 3000);
    } catch (e: any) {
      alert('Save failed: ' + (e.response?.data?.message || e.message));
    }
    setSaving(false);
  };

  const handleRevert = async (code: string) => {
    if (!confirm(`Revert ${code} to canonical plan settings? This removes admin overrides.`)) return;
    try {
      await api.delete(`/admin/plans/${code}`);
      loadPlans();
    } catch (e: any) {
      alert('Revert failed: ' + (e.response?.data?.message || e.message));
    }
  };

  const toggleEntitlement = (key: string) => {
    setForm((f: any) => ({ ...f, entitlements: { ...f.entitlements, [key]: !f.entitlements[key] } }));
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-gray-400" /></div>;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Plan Management</h1>
        <p className="text-sm text-gray-500 mt-1">Tune subscription plans, pricing, and feature entitlements. Changes apply immediately on the pricing page.</p>
      </div>

      {/* Plans */}
      <div className="space-y-4 mb-8">
        {plans.filter(p => !p.isLegacy).map(plan => (
          <div key={plan.code} className={`border rounded-xl bg-white p-6 ${plan._override ? 'border-amber-300 bg-amber-50' : ''}`}>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                {plan.isCustom ? <Crown size={24} className="text-amber-500 mt-1" /> : <Zap size={24} className="text-blue-500 mt-1" />}
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">{plan.name}</h2>
                    <code className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{plan.code}</code>
                    {plan._override && <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">Override active</span>}
                    {!plan.active && <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Inactive</span>}
                  </div>
                  {plan.tagline && <p className="text-sm text-gray-500 mt-1">{plan.tagline}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {saved === plan.code && <span className="text-green-600 text-sm flex items-center gap-1"><Check size={14} /> Saved</span>}
                {editing !== plan.code && (
                  <button onClick={() => startEdit(plan)} className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 min-h-[44px]">Edit</button>
                )}
                {plan._override && editing !== plan.code && (
                  <button onClick={() => handleRevert(plan.code)} className="p-2 min-h-[44px] min-w-[44px] rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600" title="Revert to canonical">
                    <RotateCcw size={16} />
                  </button>
                )}
              </div>
            </div>

            {editing === plan.code ? (
              /* Edit form */
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Name</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Tagline</label>
                    <input value={form.tagline} onChange={e => setForm({ ...form, tagline: e.target.value })} className="w-full border rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Price/seat (cents)</label>
                    <input type="number" value={form.priceCentsPerSeat} onChange={e => setForm({ ...form, priceCentsPerSeat: Number(e.target.value) })} className="w-full border rounded-md px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Max Seats</label>
                    <input type="number" value={form.seats} onChange={e => setForm({ ...form, seats: Number(e.target.value) })} className="w-full border rounded-md px-3 py-2 text-sm" />
                  </div>
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
                    Active (shown on pricing page)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.isCustom} onChange={e => setForm({ ...form, isCustom: e.target.checked })} />
                    Custom (contact sales)
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-2">Feature Entitlements</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(ENTITLEMENT_LABELS).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={!!form.entitlements?.[key]} onChange={() => toggleEntitlement(key)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => handleSave(plan.code)} disabled={saving} className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm font-medium min-h-[44px]">
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Override
                  </button>
                  <button onClick={cancelEdit} className="px-4 py-2.5 border rounded-lg text-sm min-h-[44px]">Cancel</button>
                </div>
              </div>
            ) : (
              /* View mode */
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-gray-500 text-xs">Price</div>
                  <div className="font-semibold text-lg">{plan.isCustom ? 'Custom' : formatPrice(plan.priceCentsPerSeat) + '/seat/mo'}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Included Seats</div>
                  <div className="font-semibold text-lg">{plan.seats}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Ticket Limit</div>
                  <div className="font-semibold text-lg">{plan.entitlements.ticketLimit === null || plan.entitlements.ticketLimit === undefined ? 'Unlimited' : plan.entitlements.ticketLimit}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">Features</div>
                  <div className="text-xs text-gray-600 mt-1">
                    {Object.entries(ENTITLEMENT_LABELS)
                      .filter(([k]) => plan.entitlements[k])
                      .map(([, label]) => label)
                      .slice(0, 3)
                      .join(', ')}
                    {Object.values(plan.entitlements).filter(v => v === true).length > 3 && ' ...'}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add-ons */}
      <div>
        <h2 className="text-lg font-bold mb-4">Add-ons</h2>
        <div className="border rounded-xl bg-white divide-y">
          {addons.map((a: any) => (
            <div key={a.code} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{a.name}</div>
                <div className="text-xs text-gray-500">{a.description}</div>
                {a.freeOnPlans?.length > 0 && (
                  <div className="text-xs text-green-600 mt-1">Free on: {a.freeOnPlans.join(', ')}</div>
                )}
              </div>
              <div className="text-sm font-semibold">
                {formatPrice(a.priceCentsMonthly)}{a.unit}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
