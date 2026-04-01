'use client';

import { useEffect, useState, useCallback } from 'react';
import { adminApi } from '@/lib/apiClient';
import { Shield, AlertCircle, Loader2, Activity } from 'lucide-react';

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [methodFilter, setMethodFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { limit: 50 };
      if (methodFilter) params.method = methodFilter;
      const [logsRes, statsRes] = await Promise.all([
        adminApi.audit.list(params),
        adminApi.audit.stats(),
      ]);
      setLogs(logsRes.data.data);
      setStats(statsRes.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [methodFilter]);

  useEffect(() => { load(); }, [load]);

  const methodColor = (m: string) => {
    if (m === 'GET') return 'bg-blue-100 text-blue-700';
    if (m === 'POST') return 'bg-green-100 text-green-700';
    if (m === 'PUT') return 'bg-amber-100 text-amber-700';
    if (m === 'DELETE') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-600';
  };

  const statusColor = (s: number) => {
    if (s < 300) return 'text-green-600';
    if (s < 400) return 'text-blue-600';
    if (s < 500) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit Log</h1>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Activity size={14} /> Requests (24h)</div>
            <p className="text-xl font-bold">{stats.last24h?.totalRequests || 0}</p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">Avg Response</div>
            <p className="text-xl font-bold">{Math.round(stats.last24h?.avgDuration || 0)}ms</p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">Errors (24h)</div>
            <p className="text-xl font-bold text-red-600">{stats.last24h?.errors || 0}</p>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <select value={methodFilter} onChange={e => setMethodFilter(e.target.value)} className="px-3 py-2.5 border rounded-lg text-sm min-h-[44px]" aria-label="Filter by method">
          <option value="">All Methods</option>
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
        </select>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 flex items-start gap-3" role="alert"><AlertCircle size={18} className="text-red-500 mt-0.5" /><p className="text-sm text-red-700">{error}</p></div>}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : (
        <div className="rounded-xl border bg-white shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Method</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Route</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Duration</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">IP</th>
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No logs found</td></tr>
              ) : logs.map(l => (
                <tr key={l._id} className="hover:bg-gray-50">
                  <td className="px-4 py-2"><span className={`text-xs font-bold px-1.5 py-0.5 rounded ${methodColor(l.method)}`}>{l.method}</span></td>
                  <td className="px-4 py-2 font-mono text-xs max-w-[300px] truncate">{l.route}</td>
                  <td className={`px-4 py-2 font-medium ${statusColor(l.status)}`}>{l.status}</td>
                  <td className="px-4 py-2 text-gray-500">{l.durationMs}ms</td>
                  <td className="px-4 py-2 text-gray-500 font-mono text-xs">{l.ip}</td>
                  <td className="px-4 py-2 text-gray-400 text-xs">{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
