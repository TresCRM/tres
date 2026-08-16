'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/apiClient';
import { Building2, Search, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

export default function TenantsPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [planFilter, setPlanFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: 50 };
      if (search) params.q = search;
      if (planFilter) params.plan = planFilter;
      const r = await adminApi.tenants.list(params);
      setTenants(r.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }, [search, planFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tenants</h1>
        <span className="text-sm text-gray-500">{tenants.length} result{tenants.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search tenants..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            aria-label="Search tenants"
          />
        </div>
        <select
          value={planFilter}
          onChange={e => setPlanFilter(e.target.value)}
          className="px-3 py-2.5 border rounded-lg text-sm min-h-[44px]"
          aria-label="Filter by plan"
        >
          <option value="">All Plans</option>
          <option value="FREE">Free</option>
          <option value="INDIVIDUAL">Individual</option>
          <option value="COMPANY">Company</option>
        </select>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3" role="alert">
          <AlertCircle size={18} className="text-red-500 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm divide-y">
          {tenants.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No tenants found</div>
          ) : tenants.map(t => (
            <Link key={t._id} href={`/admin/tenants/${t._id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50 transition-colors min-h-[56px]">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Building2 size={16} className="text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.branding?.name || t.slug}</p>
                  <p className="text-xs text-gray-500 truncate">{t.slug}</p>
                </div>
              </div>
              <div className="hidden md:block min-w-0 flex-1 text-sm text-gray-600 truncate">
                {t.ownerEmail || <span className="text-gray-400">—</span>}
              </div>
              <div className="hidden sm:block text-xs text-gray-500 whitespace-nowrap">
                {t.createdAt ? new Date(t.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                  t.plan === 'COMPANY' ? 'bg-purple-100 text-purple-700' :
                  t.plan === 'INDIVIDUAL' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{t.plan}</span>
                <span className={`w-2 h-2 rounded-full ${t.isActive ? 'bg-green-500' : 'bg-red-500'}`} title={t.isActive ? 'Active' : 'Suspended'} />
                <ChevronRight size={16} className="text-gray-400" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
