'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/apiClient';
import { Ticket, Search, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: 50 };
      if (search) params.q = search;
      if (statusFilter) params.status = statusFilter;
      if (priorityFilter) params.priority = priorityFilter;
      const r = await adminApi.tickets.list(params);
      setTickets(r.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, priorityFilter]);

  useEffect(() => { load(); }, [load]);

  const priorityColor = (p: string) => {
    if (p === 'URGENT') return 'bg-red-100 text-red-700';
    if (p === 'HIGH') return 'bg-orange-100 text-orange-700';
    if (p === 'MEDIUM') return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tickets</h1>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search tickets..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" aria-label="Search tickets" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2.5 border rounded-lg text-sm min-h-[44px]" aria-label="Filter by status">
          <option value="">All Status</option>
          <option value="OPEN">Open</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="AWAITING_CUSTOMER">Awaiting Customer</option>
          <option value="TRANSFERRED">Transferred</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
          <option value="REOPENED">Reopened</option>
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="px-3 py-2.5 border rounded-lg text-sm min-h-[44px]" aria-label="Filter by priority">
          <option value="">All Priority</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3" role="alert"><AlertCircle size={18} className="text-red-500 mt-0.5" /><p className="text-sm text-red-700">{error}</p></div>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm divide-y">
          {tickets.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No tickets found</div>
          ) : tickets.map(t => (
            <Link key={t._id} href={`/admin/tickets/${t._id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors min-h-[56px]">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2 h-2 rounded-full shrink-0 ${t.status === 'OPEN' ? 'bg-green-500' : t.status === 'PENDING' ? 'bg-amber-500' : 'bg-gray-400'}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.subject}</p>
                  <p className="text-xs text-gray-500 truncate">{t.tenant?.branding?.name || t.tenant?.slug || '—'} &middot; {t.customer?.email || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {t.priority && <span className={`text-xs font-medium px-2 py-0.5 rounded ${priorityColor(t.priority)}`}>{t.priority}</span>}
                <ChevronRight size={16} className="text-gray-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
