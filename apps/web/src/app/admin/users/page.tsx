'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/apiClient';
import { Users, Search, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: 50 };
      if (search) params.q = search;
      if (statusFilter) params.status = statusFilter;
      const r = await adminApi.users.list(params);
      setUsers(r.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const statusBadge = (s: string) => {
    const cls = s === 'ACTIVE' ? 'bg-green-100 text-green-700' : s === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
    return <span className={`text-xs font-medium px-2 py-0.5 rounded ${cls}`}>{s}</span>;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Users</h1>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500" aria-label="Search users" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-2.5 border rounded-lg text-sm min-h-[44px]" aria-label="Filter by status">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING">Pending</option>
          <option value="DISABLED">Disabled</option>
        </select>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3" role="alert"><AlertCircle size={18} className="text-red-500 mt-0.5" /><p className="text-sm text-red-700">{error}</p></div>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm divide-y">
          {users.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No users found</div>
          ) : users.map(u => (
            <Link key={u._id} href={`/admin/users/${u._id}`} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors min-h-[56px]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center text-sm font-bold text-indigo-600">
                  {(u.firstName?.[0] || '?').toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium">{u.firstName} {u.lastName}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex gap-1">
                  {u.roles?.map((r: string) => (
                    <span key={r} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{r}</span>
                  ))}
                </div>
                {statusBadge(u.status)}
                <ChevronRight size={16} className="text-gray-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
