'use client';

import { useState, useEffect } from 'react';
import { Key, Plus, Trash2, Copy, Check, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { timeAgo } from '@/lib/timeAgo';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

const SCOPES = [
  { value: 'tickets:read', label: 'Read tickets' },
  { value: 'tickets:write', label: 'Create/update tickets' },
  { value: 'customers:read', label: 'Read customers' },
  { value: 'customers:write', label: 'Create/update customers' },
  { value: 'staff:manage', label: 'Manage staff' },
  { value: 'templates:read', label: 'Read templates' },
  { value: 'templates:write', label: 'Create/update templates' },
  { value: 'settings:read', label: 'Read settings' },
  { value: 'settings:write', label: 'Update settings' },
  { value: 'webhooks:manage', label: 'Manage webhooks' },
  { value: 'analytics:read', label: 'Read analytics' },
];

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['tickets:read', 'tickets:write']);
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('production');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadKeys = () => {
    api.get('/api-keys').then(res => { setKeys(res.data.data || []); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(() => { loadKeys(); }, []);

  const handleCreate = async () => {
    if (!name.trim() || selectedScopes.length === 0) return;
    setCreating(true);
    try {
      const res = await api.post('/api-keys', { name: name.trim(), scopes: selectedScopes, environment });
      setNewKey(res.data.rawKey || res.data.data?.rawKey || '');
      loadKeys();
      setShowCreate(false);
      setName('');
    } catch {}
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    await api.delete('/api-keys/' + id);
    setConfirmDelete(null);
    loadKeys();
  };

  const copyKey = () => { navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const toggleScope = (scope: string) => { setSelectedScopes(prev => prev.includes(scope) ? prev.filter(s => s !== scope) : [...prev, scope]); };

  if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-gray-400" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm font-medium min-h-[44px]">
          <Plus size={16} /> New Key
        </button>
      </div>

      {newKey && (
        <div className="border border-green-300 bg-green-50 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-green-800 mb-2">API Key created. Copy it now — it won&apos;t be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border rounded px-3 py-2 text-sm font-mono break-all">{newKey}</code>
            <button onClick={copyKey} className="p-2 min-h-[44px] min-w-[44px] rounded-md hover:bg-green-100">
              {copied ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
            </button>
          </div>
          <button onClick={() => setNewKey('')} className="text-xs text-green-700 mt-2 hover:underline">Dismiss</button>
        </div>
      )}

      {showCreate && (
        <div className="border rounded-xl bg-white p-6 mb-6 space-y-4">
          <div>
            <label htmlFor="key-name" className="block text-sm font-medium mb-1">Name</label>
            <input id="key-name" value={name} onChange={e => setName(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="My integration" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Environment</label>
            <div className="flex gap-2">
              {(['production', 'sandbox'] as const).map(env => (
                <button key={env} onClick={() => setEnvironment(env)} className={`px-4 py-2 rounded-md text-sm font-medium border min-h-[44px] ${environment === env ? (env === 'sandbox' ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-blue-50 border-blue-300 text-blue-700') : 'bg-white text-gray-500'}`}>
                  {env === 'sandbox' ? 'Sandbox (sk_test_)' : 'Production (sk_live_)'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Scopes</label>
            <div className="grid grid-cols-2 gap-2">
              {SCOPES.map(s => (
                <label key={s.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={selectedScopes.includes(s.value)} onChange={() => toggleScope(s.value)} className="rounded" />
                  {s.label}
                </label>
              ))}
            </div>
          </div>
          <button onClick={handleCreate} disabled={creating || !name.trim() || selectedScopes.length === 0} className="px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm font-medium min-h-[44px]">
            {creating ? 'Creating...' : 'Create Key'}
          </button>
        </div>
      )}

      {keys.length === 0 ? (
        <div className="text-center py-12 text-gray-500 border rounded-xl bg-white">
          <Key size={32} className="mx-auto text-gray-300 mb-3" />
          <p>No API keys yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {keys.map((k: any) => (
            <div key={k._id} className="border rounded-lg bg-white p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm">{k.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${k.environment === 'sandbox' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                    {k.environment || 'production'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1"><code>{k.prefix}****</code> &middot; {k.scopes?.length || 0} scopes &middot; {k.lastUsedAt ? 'Used ' + timeAgo(k.lastUsedAt) : 'Never used'}</p>
              </div>
              <button onClick={() => setConfirmDelete(k._id)} className="p-2 min-h-[44px] min-w-[44px] rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog open={!!confirmDelete} title="Revoke API Key" message="This key will be permanently disabled." confirmLabel="Revoke" variant="danger" onConfirm={() => confirmDelete && handleDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
