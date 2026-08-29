'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminApi } from '@/lib/apiClient';
import { ArrowLeft, AlertCircle, Loader2, XCircle, Clock } from 'lucide-react';
import Link from 'next/link';

export default function AdminSubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.subscriptions.get(id)
      .then(r => setData(r.data.data))
      .catch(e => setError(e?.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleCancel() {
    setBusy(true);
    try {
      const r = await adminApi.subscriptions.cancel(id);
      setData(r.data.data);
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed'); }
    finally { setBusy(false); }
  }

  async function handleExtendGrace() {
    setBusy(true);
    try {
      const r = await adminApi.subscriptions.extendGrace(id, 7);
      setData(r.data.data);
    } catch (e: any) { setError(e?.response?.data?.message || 'Failed'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;
  if (!data) return <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-sm text-red-700" role="alert">{error || 'Not found'}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/subscriptions" className="p-2 rounded-md hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Back"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-2xl font-bold">{data.tenant?.branding?.name || data.tenant?.slug || 'Subscription'}</h1>
          <p className="text-sm text-gray-500">{data.planCode} &middot; {data.seats} seats</p>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-sm text-gray-700 mb-3">Details</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Status</dt><dd className={`text-xs font-medium px-2 py-0.5 rounded ${data.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : data.status === 'GRACE' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{data.status}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Interval</dt><dd>{data.interval}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Period End</dt><dd>{data.currentPeriodEnd ? new Date(data.currentPeriodEnd).toLocaleDateString() : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Grace Until</dt><dd>{data.graceUntil ? new Date(data.graceUntil).toLocaleDateString() : '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Auto Renew</dt><dd>{data.autoRenew ? 'Yes' : 'No'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Provider</dt><dd>{data.provider}</dd></div>
          </dl>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-sm text-gray-700 mb-3">Actions</h2>
          <div className="space-y-3">
            {data.status !== 'CANCELED' && (
              <button onClick={handleCancel} disabled={busy} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 transition-colors min-h-[44px]">
                <XCircle size={16} /> Cancel Subscription
              </button>
            )}
            <button onClick={handleExtendGrace} disabled={busy} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors min-h-[44px]">
              <Clock size={16} /> Extend Grace (+7 days)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
