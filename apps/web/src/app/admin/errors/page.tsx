'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/apiClient';
import { AlertTriangle, AlertCircle, Loader2, Server, Globe, TrendingUp } from 'lucide-react';

export default function AdminErrorsPage() {
  const [errors, setErrors] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [httpFilter, setHttpFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: 50 };
      if (httpFilter) params.http = Number(httpFilter);
      if (methodFilter) params.method = methodFilter;
      const [errorsRes, statsRes] = await Promise.all([
        adminApi.errors.list(params),
        adminApi.errors.stats(),
      ]);
      setErrors(errorsRes.data.data);
      setStats(statsRes.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load errors');
    } finally {
      setLoading(false);
    }
  }, [httpFilter, methodFilter]);

  useEffect(() => { load(); }, [load]);

  const severityColor = (http: number) => {
    if (http >= 500) return 'bg-red-100 text-red-700';
    if (http >= 400) return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Error Dashboard</h1>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><AlertTriangle size={14} /> Total Errors (24h)</div>
            <p className="text-xl font-bold">{stats.last24h?.total || 0}</p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Server size={14} /> Server Errors (5xx)</div>
            <p className="text-xl font-bold text-red-600">{stats.last24h?.serverErrors || 0}</p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Globe size={14} /> Client Errors (4xx)</div>
            <p className="text-xl font-bold text-amber-600">{stats.last24h?.clientErrors || 0}</p>
          </div>
        </div>
      )}

      {/* Top Error Codes + Top Routes */}
      {stats && (stats.topCodes?.length > 0 || stats.topRoutes?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.topCodes?.length > 0 && (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2"><TrendingUp size={14} /> Top Error Codes (24h)</h2>
              <div className="space-y-2">
                {stats.topCodes.map((c: any) => (
                  <div key={c._id} className="flex items-center justify-between text-sm">
                    <code className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono">{c._id || 'unknown'}</code>
                    <span className="font-medium text-gray-700">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {stats.topRoutes?.length > 0 && (
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-gray-600 mb-3 flex items-center gap-2"><TrendingUp size={14} /> Top Error Routes (24h)</h2>
              <div className="space-y-2">
                {stats.topRoutes.map((r: any) => (
                  <div key={r._id} className="flex items-center justify-between text-sm">
                    <code className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono truncate max-w-[200px]">{r._id}</code>
                    <span className="font-medium text-gray-700">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select value={httpFilter} onChange={e => setHttpFilter(e.target.value)} className="px-3 py-2.5 border rounded-lg text-sm min-h-[44px]" aria-label="Filter by HTTP status">
          <option value="">All Status Codes</option>
          <option value="400">400 Bad Request</option>
          <option value="401">401 Unauthorized</option>
          <option value="403">403 Forbidden</option>
          <option value="404">404 Not Found</option>
          <option value="409">409 Conflict</option>
          <option value="422">422 Unprocessable</option>
          <option value="429">429 Rate Limited</option>
          <option value="500">500 Internal Error</option>
          <option value="502">502 Bad Gateway</option>
          <option value="503">503 Unavailable</option>
        </select>
        <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="px-3 py-2.5 border rounded-lg text-sm min-h-[44px]" aria-label="Filter by method">
          <option value="">All Methods</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3" role="alert"><AlertCircle size={18} className="text-red-500 mt-0.5" /><p className="text-sm text-red-700">{error}</p></div>}

      {/* Error Log Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b bg-gray-50">
                <th scope="col" className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                <th scope="col" className="text-left px-4 py-2.5 font-medium text-gray-600">Code</th>
                <th scope="col" className="text-left px-4 py-2.5 font-medium text-gray-600">Method</th>
                <th scope="col" className="text-left px-4 py-2.5 font-medium text-gray-600">Route</th>
                <th scope="col" className="text-left px-4 py-2.5 font-medium text-gray-600">Message</th>
                <th scope="col" className="text-left px-4 py-2.5 font-medium text-gray-600">IP</th>
                <th scope="col" className="text-left px-4 py-2.5 font-medium text-gray-600">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {errors.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No errors found</td></tr>
              ) : errors.map(e => (
                <tr key={e._id} className="hover:bg-gray-50">
                  <td className="px-4 py-2"><span className={`text-xs font-bold px-1.5 py-0.5 rounded ${severityColor(e.http)}`}>{e.http}</span></td>
                  <td className="px-4 py-2 font-mono text-xs">{e.code || '-'}</td>
                  <td className="px-4 py-2 text-xs font-medium">{e.method}</td>
                  <td className="px-4 py-2 font-mono text-xs max-w-[200px] truncate">{e.route}</td>
                  <td className="px-4 py-2 text-gray-600 max-w-[250px] truncate">{e.message || '-'}</td>
                  <td className="px-4 py-2 text-gray-500 font-mono text-xs">{e.ip}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
