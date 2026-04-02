'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/apiClient';
import { FileText, Plus, AlertCircle, Loader2, Pencil, Trash2, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export default function AdminContentPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ slug: '', title: '', body: '', type: 'PAGE', status: 'DRAFT' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: 50 };
      if (typeFilter) params.type = typeFilter;
      const r = await adminApi.content.list(params);
      setItems(r.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditItem(null);
    setForm({ slug: '', title: '', body: '', type: 'PAGE', status: 'DRAFT' });
    setModalOpen(true);
  }

  function openEdit(item: any) {
    setEditItem(item);
    setForm({ slug: item.slug, title: item.title, body: item.body, type: item.type, status: item.status });
    setModalOpen(true);
  }

  async function handleSave() {
    setBusy(true);
    setError('');
    try {
      if (editItem) {
        await adminApi.content.update(editItem._id, { title: form.title, body: form.body, status: form.status });
      } else {
        await adminApi.content.create(form as any);
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
    if (!confirm('Delete this content?')) return;
    try {
      await adminApi.content.remove(id);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Delete failed');
    }
  }

  const statusBadge = (s: string) => {
    const cls = s === 'PUBLISHED' ? 'bg-green-100 text-green-700' : s === 'DRAFT' ? 'bg-gray-100 text-gray-600' : 'bg-red-100 text-red-700';
    return <span className={`text-xs font-medium px-2 py-0.5 rounded ${cls}`}>{s}</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Content</h1>
        <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors min-h-[40px]">
          <Plus size={16} /> New Content
        </button>
      </div>

      <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="px-3 py-2.5 border rounded-lg text-sm min-h-[44px]" aria-label="Filter by type">
        <option value="">All Types</option>
        <option value="PAGE">Page</option>
        <option value="ANNOUNCEMENT">Announcement</option>
        <option value="POLICY">Policy</option>
        <option value="FAQ">FAQ</option>
      </select>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3" role="alert"><AlertCircle size={18} className="text-red-500 mt-0.5" /><p className="text-sm text-red-700">{error}</p></div>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm divide-y">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No content yet</div>
          ) : items.map(item => (
            <div key={item._id} className="flex items-center justify-between px-4 py-3 min-h-[56px]">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0"><FileText size={16} className="text-indigo-600" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-gray-500">/{item.slug} &middot; {item.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {statusBadge(item.status)}
                <button onClick={() => openEdit(item)} className="p-2 rounded hover:bg-gray-100 min-h-[36px] min-w-[36px]" aria-label="Edit"><Pencil size={14} className="text-gray-500" /></button>
                <button onClick={() => handleDelete(item._id)} className="p-2 rounded hover:bg-red-50 min-h-[36px] min-w-[36px]" aria-label="Delete"><Trash2 size={14} className="text-red-500" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Content' : 'New Content'} footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button>
        </div>
      }>
        <div className="space-y-3">
          {!editItem && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="my-page" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="Page Title" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
            <textarea value={form.body} onChange={e => setForm(f => ({ ...f, body: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm h-32 resize-none" placeholder="Content body..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {!editItem && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm">
                  <option value="PAGE">Page</option>
                  <option value="ANNOUNCEMENT">Announcement</option>
                  <option value="POLICY">Policy</option>
                  <option value="FAQ">FAQ</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
