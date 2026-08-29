'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/apiClient';
import { Settings, AlertCircle, Loader2, Save, Plus, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

export default function AdminSettingsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    adminApi.settings.get()
      .then(r => setData(r.data.data))
      .catch(e => setError(e?.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const r = await adminApi.settings.update({
        maintenanceMode: data.maintenanceMode,
        signupEnabled: data.signupEnabled,
        defaultPlan: data.defaultPlan,
        maxTenantsPerUser: data.maxTenantsPerUser,
        supportEmail: data.supportEmail,
        platformName: data.platformName,
        featureFlags: (data.featureFlags || []).filter((f: any) => f.key),
      });
      setData(r.data.data);
      setSuccess('Settings saved');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Platform Settings</h1>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3" role="alert"><AlertCircle size={18} className="text-red-500 mt-0.5" /><p className="text-sm text-red-700">{error}</p></div>}
      {success && <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-700" role="status">{success}</div>}

      {data && (
        <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Platform Name</label>
            <input value={data.platformName || ''} onChange={e => setData((d: any) => ({ ...d, platformName: e.target.value }))} className="w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Support Email</label>
            <input type="email" value={data.supportEmail || ''} onChange={e => setData((d: any) => ({ ...d, supportEmail: e.target.value }))} className="w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Default Plan</label>
            <select value={data.defaultPlan || 'FREE'} onChange={e => setData((d: any) => ({ ...d, defaultPlan: e.target.value }))} className="w-full px-3 py-2.5 border rounded-lg text-sm">
              <option value="FREE">Free</option>
              <option value="IND-1">Individual</option>
              <option value="CO-20">Company 20</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Max Tenants Per User</label>
            <input type="number" min={1} max={100} value={data.maxTenantsPerUser || 3} onChange={e => setData((d: any) => ({ ...d, maxTenantsPerUser: parseInt(e.target.value) || 3 }))} className="w-full px-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={data.signupEnabled ?? true} onChange={e => setData((d: any) => ({ ...d, signupEnabled: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
              <div>
                <p className="text-sm font-medium">Signups Enabled</p>
                <p className="text-xs text-gray-500">Allow new tenant registrations</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={data.maintenanceMode ?? false} onChange={e => setData((d: any) => ({ ...d, maintenanceMode: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500" />
              <div>
                <p className="text-sm font-medium text-red-700">Maintenance Mode</p>
                <p className="text-xs text-gray-500">Restrict platform access for maintenance</p>
              </div>
            </label>
          </div>

          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors min-h-[44px] disabled:opacity-50">
            <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* Feature Flags */}
      {data && (
        <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">Feature Flags</h2>
              <p className="text-xs text-gray-500">Toggle features on or off across the platform.</p>
            </div>
            <button
              onClick={() => setData((d: any) => ({
                ...d,
                featureFlags: [...(d.featureFlags || []), { key: '', enabled: false, description: '' }],
              }))}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50 transition-colors min-h-[40px]"
            >
              <Plus size={14} /> Add Flag
            </button>
          </div>

          {(!data.featureFlags || data.featureFlags.length === 0) ? (
            <p className="text-sm text-gray-400 text-center py-4">No feature flags configured.</p>
          ) : (
            <div className="space-y-3">
              {data.featureFlags.map((flag: any, idx: number) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                  <button
                    onClick={() => setData((d: any) => {
                      const flags = [...d.featureFlags];
                      flags[idx] = { ...flags[idx], enabled: !flags[idx].enabled };
                      return { ...d, featureFlags: flags };
                    })}
                    className="mt-1 shrink-0"
                    aria-label={flag.enabled ? 'Disable flag' : 'Enable flag'}
                  >
                    {flag.enabled
                      ? <ToggleRight size={24} className="text-green-600" />
                      : <ToggleLeft size={24} className="text-gray-400" />
                    }
                  </button>
                  <div className="flex-1 space-y-2 min-w-0">
                    <input
                      value={flag.key}
                      onChange={e => setData((d: any) => {
                        const flags = [...d.featureFlags];
                        flags[idx] = { ...flags[idx], key: e.target.value.replace(/[^a-zA-Z0-9_.-]/g, '') };
                        return { ...d, featureFlags: flags };
                      })}
                      placeholder="flag.key (e.g. enable_ai_summaries)"
                      className="w-full px-3 py-1.5 border rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                    <input
                      value={flag.description}
                      onChange={e => setData((d: any) => {
                        const flags = [...d.featureFlags];
                        flags[idx] = { ...flags[idx], description: e.target.value };
                        return { ...d, featureFlags: flags };
                      })}
                      placeholder="Description"
                      className="w-full px-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                    />
                  </div>
                  <button
                    onClick={() => setData((d: any) => ({
                      ...d,
                      featureFlags: d.featureFlags.filter((_: any, i: number) => i !== idx),
                    }))}
                    className="mt-1 p-1.5 text-gray-400 hover:text-red-600 transition-colors rounded hover:bg-red-50 shrink-0"
                    aria-label="Remove flag"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors min-h-[44px] disabled:opacity-50">
            <Save size={16} /> {saving ? 'Saving...' : 'Save Flags'}
          </button>
        </div>
      )}
    </div>
  );
}
