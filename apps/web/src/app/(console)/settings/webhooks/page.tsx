'use client';

import { useState, useEffect } from 'react';
import { Webhook, Plus, Trash2, Play, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import api from '@/lib/api';
import { timeAgo } from '@/lib/timeAgo';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

const EVENT_GROUPS = [
  { label: 'Ticket', events: ['ticket.created', 'ticket.assigned', 'ticket.status_changed', 'ticket.replied', 'ticket.closed', 'ticket.reopened', 'ticket.merged', 'ticket.sla_breach'] },
  { label: 'Customer', events: ['customer.created', 'customer.updated', 'customer.deleted'] },
  { label: 'Team', events: ['user.invited', 'user.accepted', 'user.removed'] },
  { label: 'Billing', events: ['payment.succeeded', 'payment.failed', 'subscription.renewed', 'subscription.expired'] },
  { label: 'Chat', events: ['chat.started', 'chat.ended'] },
  { label: 'Survey', events: ['survey.submitted'] },
];

export default function WebhooksPage() {
  const [hooks, setHooks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean } | null>(null);

  const loadHooks = () => {
    api.get('/webhooks').then(res => { setHooks(res.data.data || []); setLoading(false); }).catch(() => setLoading(false));
  };
  useEffect(() => { loadHooks(); }, []);

  const handleCreate = async () => {
    if (!url.trim() || selectedEvents.length === 0) return;
    setCreating(true);
    try {
      const res = await api.post('/webhooks', { url: url.trim(), events: selectedEvents });
      setNewSecret(res.data.data?.secret || '');
      loadHooks();
      setShowCreate(false);
      setUrl('');
      setSelectedEvents([]);
    } catch {}
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    await api.delete('/webhooks/' + id);
    setConfirmDelete(null);
    loadHooks();
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      await api.post('/webhooks/' + id + '/test');
      setTestResult({ id, ok: true });
    } catch {
      setTestResult({ id, ok: false });
    }
    setTesting(null);
    setTimeout(() => setTestResult(null), 3000);
  };

  const toggleEvent = (evt: string) => {
    setSelectedEvents(prev => prev.includes(evt) ? prev.filter(e => e !== evt) : [...prev, evt]);
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-gray-400" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Webhooks</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm font-medium min-h-[44px]">
          <Plus size={16} /> New Webhook
        </button>
      </div>

      {newSecret && (
        <div className="border border-green-300 bg-green-50 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-green-800 mb-2">Webhook created. Save the signing secret:</p>
          <code className="block bg-white border rounded px-3 py-2 text-sm font-mono break-all">{newSecret}</code>
          <button onClick={() => setNewSecret('')} className="text-xs text-green-700 mt-2 hover:underline">Dismiss</button>
        </div>
      )}

      {showCreate && (
        <div className="border rounded-xl bg-white p-6 mb-6 space-y-4">
          <div>
            <label htmlFor="wh-url" className="block text-sm font-medium mb-1">Endpoint URL</label>
            <input id="wh-url" type="url" value={url} onChange={e => setUrl(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="https://your-server.com/webhook" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Events</label>
            {EVENT_GROUPS.map(g => (
              <div key={g.label} className="mb-3">
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">{g.label}</p>
                <div className="grid grid-cols-2 gap-1">
                  {g.events.map(evt => (
                    <label key={evt} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                      <input type="checkbox" checked={selectedEvents.includes(evt)} onChange={() => toggleEvent(evt)} className="rounded" />
                      <code className="text-xs">{evt}</code>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button onClick={handleCreate} disabled={creating || !url.trim() || selectedEvents.length === 0} className="px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm font-medium min-h-[44px]">
            {creating ? 'Creating...' : 'Create Webhook'}
          </button>
        </div>
      )}

      {hooks.length === 0 ? (
        <div className="text-center py-12 text-gray-500 border rounded-xl bg-white">
          <Webhook size={32} className="mx-auto text-gray-300 mb-3" />
          <p>No webhooks configured.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {hooks.map((h: any) => (
            <div key={h._id} className="border rounded-lg bg-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm truncate max-w-[300px]">{h.url}</code>
                    {!h.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">Disabled</span>}
                    {h.failCount > 0 && <span className="flex items-center gap-1 text-xs text-amber-600"><AlertTriangle size={12} /> {h.failCount} failures</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{h.events?.length || 0} events &middot; {h.lastTriggeredAt ? 'Last fired ' + timeAgo(h.lastTriggeredAt) : 'Never fired'}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleTest(h._id)} disabled={testing === h._id} className="p-2 min-h-[44px] min-w-[44px] rounded-md hover:bg-gray-100 text-gray-500" title="Test">
                    {testing === h._id ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  </button>
                  {testResult && testResult.id === h._id && (testResult.ok ? <CheckCircle size={16} className="text-green-500" /> : <AlertTriangle size={16} className="text-red-500" />)}
                  <button onClick={() => setConfirmDelete(h._id)} className="p-2 min-h-[44px] min-w-[44px] rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <ConfirmDialog open={!!confirmDelete} title="Delete Webhook" message="This webhook will stop receiving events." confirmLabel="Delete" variant="danger" onConfirm={() => confirmDelete && handleDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
