'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/apiClient';
import { CreditCard, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function AdminSubscriptionsPage() {
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: 50 };
      if (statusFilter) params.status = statusFilter;
      const r = await adminApi.subscriptions.list(params);
      setSubs(r.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load subscriptions');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const statusColor = (s: string) => {
    if (s === 'ACTIVE') return 'bg-green-100 text-green-700';
    if (s === 'GRACE') return 'bg-amber-100 text-amber-700';
    if (s === 'EXPIRED' || s === 'CANCELED') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Subscriptions</h1>

      <div className="flex gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2.5 border rounded-lg text-sm min-h-[44px]" aria-label="Filter by status">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="PAST_DUE">Past Due</option>
          <option value="GRACE">Grace</option>
          <option value="EXPIRED">Expired</option>
          <option value="CANCELED">Canceled</option>
        </select>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3" role="alert"><AlertCircle size={18} className="text-red-500 mt-0.5" /><p className="text-sm text-red-700">{error}</p></div>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm divide-y">
          {subs.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No subscriptions found</div>
          ) : subs.map(s => (
            <Link key={s._id} href={`/admin/subscriptions/${s._id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors min-h-[56px]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center"><CreditCard size={16} className="text-purple-600" /></div>
                <div>
                  <p className="text-sm font-medium">{s.tenant?.branding?.name || s.tenant?.slug || 'Unknown'}</p>
                  <p className="text-xs text-gray-500">{s.planCode} &middot; {s.seats} seats</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColor(s.status)}`}>{s.status}</span>
                <ChevronRight size={16} className="text-gray-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
