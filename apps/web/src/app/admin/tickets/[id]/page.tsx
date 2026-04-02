'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminApi } from '@/lib/apiClient';
import { ArrowLeft, AlertCircle, Loader2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function AdminTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    adminApi.tickets.get(id)
      .then(r => setData(r.data.data))
      .catch(e => setError(e?.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleEscalate() {
    setBusy(true);
    try {
      await adminApi.tickets.escalate(id, reason || undefined);
      const r = await adminApi.tickets.get(id);
      setData(r.data.data);
      setReason('');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Escalation failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;
  if (!data) return <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-sm text-red-700" role="alert">{error || 'Ticket not found'}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/tickets" className="p-2 rounded-md hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Back"><ArrowLeft size={20} /></Link>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold truncate">{data.subject}</h1>
          <p className="text-sm text-gray-500">{data.tenant?.branding?.name || data.tenant?.slug} &middot; {data.status} &middot; {data.priority}</p>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-sm text-gray-700 mb-3">Description</h2>
            <div className="text-sm text-gray-600 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: data.body || '<em>No description</em>' }} />
          </div>

          {data.comments?.length > 0 && (
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-sm text-gray-700 mb-3">Comments ({data.comments.length})</h2>
              <div className="space-y-3">
                {data.comments.map((c: any) => (
                  <div key={c._id} className={`text-sm p-3 rounded-lg ${c.isInternal ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-xs">{c.authorId}</span>
                      {c.isInternal && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Internal</span>}
                      <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <p>{c.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-sm text-gray-700 mb-3">Details</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Status</dt><dd className="font-medium">{data.status}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Priority</dt><dd className="font-medium">{data.priority}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Created</dt><dd>{new Date(data.createdAt).toLocaleDateString()}</dd></div>
            </dl>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-sm text-gray-700 mb-3">Escalate</h2>
            <div className="space-y-3">
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Reason for escalation (optional)"
                className="w-full px-3 py-2 border rounded-lg text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-red-500"
                aria-label="Escalation reason"
              />
              <button
                onClick={handleEscalate}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors min-h-[44px] disabled:opacity-50"
              >
                <AlertTriangle size={16} /> Escalate to Urgent
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
