'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/apiClient';
import { Megaphone, Plus, AlertCircle, Loader2, Pencil, Trash2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export default function AdminAnnouncementsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', level: 'INFO', startsAt: '', endsAt: '', isActive: true });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminApi.announcements.list({ limit: 50 });
      setItems(r.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditItem(null);
    setForm({ title: '', body: '', level: 'INFO', startsAt: new Date().toISOString().slice(0, 16), endsAt: '', isActive: true });
    setModalOpen(true);
  }

  function openEdit(item: any) {
    setEditItem(item);
    setForm({
      title: item.title,
      body: item.body,
      level: item.level,
      startsAt: item.startsAt ? new Date(item.startsAt).toISOString().slice(0, 16) : '',
      endsAt: item.endsAt ? new Date(item.endsAt).toISOString().slice(0, 16) : '',
      isActive: item.isActive,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    setBusy(true);
    setError('');
    try {
      const payload: any = {
        title: form.title,
        body: form.body,
        level: form.level,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        isActive: form.isActive,
      };
      if (editItem) {
        await adminApi.announcements.update(editItem._id, payload);
      } else {
        await adminApi.announcements.create(payload);
      }
      setModalOpen(false);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return;
    try {
      await adminApi.announcements.remove(id);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Delete failed');
    }
  }

  const levelBadge = (l: string) => {
    const cls = l === 'CRITICAL' ? 'bg-red-100 text-red-700' : l === 'WARNING' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700';
    return <span className={`text-xs font-medium px-2 py-0.5 rounded ${cls}`}>{l}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Announcements</h1>
        <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors min-h-[40px]">
          <Plus size={16} /> New Announcement
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3" role="alert"><AlertCircle size={18} className="text-red-500 mt-0.5" /><p className="text-sm text-red-700">{error}</p></div>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm divide-y">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No announcements</div>
          ) : items.map(item => (
            <div key={item._id} className="flex items-center justify-between px-4 py-3 min-h-[56px]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0"><Megaphone size={16} className="text-amber-600" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(item.startsAt).toLocaleDateString()} {item.endsAt ? `— ${new Date(item.endsAt).toLocaleDateString()}` : '(no end)'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {levelBadge(item.level)}
                <span className={`w-2 h-2 rounded-full ${item.isActive ? 'bg-green-500' : 'bg-gray-400'}`} title={item.isActive ? 'Active' : 'Inactive'} />
                <button onClick={() => openEdit(item)} className="p-2 rounded hover:bg-gray-100 min-h-[36px] min-w-[36px]" aria-label="Edit"><Pencil size={14} className="text-gray-500" /></button>
                <button onClick={() => handleDelete(item._id)} className="p-2 rounded hover:bg-red-50 min-h-[36px] min-w-[36px]" aria-label="Delete"><Trash2 size={14} className="text-red-500" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Announcement' : 'New Announcement'} footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button>
        </div>
      }>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm h-24 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
              <select value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="INFO">Info</option>
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mt-7">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 rounded border-gray-300" />
                Active
              </label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Starts At</label>
              <input type="datetime-local" value={form.startsAt} onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ends At (optional)</label>
              <input type="datetime-local" value={form.endsAt} onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
