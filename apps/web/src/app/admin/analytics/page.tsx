'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/apiClient';
import { BarChart3, TrendingUp, PieChart, AlertCircle, Loader2 } from 'lucide-react';

export default function AdminAnalyticsPage() {
  const [overview, setOverview] = useState<any>(null);
  const [growth, setGrowth] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      adminApi.analytics.overview(),
      adminApi.analytics.growth(),
      adminApi.analytics.plans(),
    ])
      .then(([o, g, p]) => {
        setOverview(o.data.data);
        setGrowth(g.data.data);
        setPlans(p.data.data);
      })
      .catch(e => setError(e?.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;
  if (error) return <div className="rounded-xl bg-red-50 border border-red-200 p-6 flex items-start gap-3" role="alert"><AlertCircle size={20} className="text-red-500" /><p className="text-sm text-red-700">{error}</p></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Growth — Tenants */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={16} className="text-blue-600" />
            <h2 className="font-semibold text-sm text-gray-700">New Tenants (30d)</h2>
          </div>
          <div className="space-y-1">
            {growth?.newTenants?.length ? growth.newTenants.slice(-10).map((d: any) => (
              <div key={d._id} className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{d._id}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, d.count * 10)}%` }} />
                  </div>
                  <span className="font-medium w-8 text-right">{d.count}</span>
                </div>
              </div>
            )) : <p className="text-sm text-gray-500">No data yet</p>}
          </div>
        </div>

        {/* Growth — Tickets */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 size={16} className="text-amber-600" />
            <h2 className="font-semibold text-sm text-gray-700">New Tickets (30d)</h2>
          </div>
          <div className="space-y-1">
            {growth?.newTickets?.length ? growth.newTickets.slice(-10).map((d: any) => (
              <div key={d._id} className="flex items-center justify-between text-sm">
                <span className="text-gray-500">{d._id}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, d.count * 5)}%` }} />
                  </div>
                  <span className="font-medium w-8 text-right">{d.count}</span>
                </div>
              </div>
            )) : <p className="text-sm text-gray-500">No data yet</p>}
          </div>
        </div>

        {/* Plan Distribution */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <PieChart size={16} className="text-purple-600" />
            <h2 className="font-semibold text-sm text-gray-700">Plan Distribution</h2>
          </div>
          <div className="space-y-2">
            {plans.length ? plans.map((p: any) => (
              <div key={p._id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{p._id}</span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500">{p.totalSeats} seats</span>
                  <span className="font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs">{p.count}</span>
                </div>
              </div>
            )) : <p className="text-sm text-gray-500">No subscriptions</p>}
          </div>
        </div>

        {/* Overview summary */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-sm text-gray-700 mb-3">Platform Summary</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-gray-500">Total Tenants</dt><dd className="font-bold text-lg">{overview?.tenants?.total || 0}</dd></div>
            <div><dt className="text-gray-500">Active Tenants</dt><dd className="font-bold text-lg">{overview?.tenants?.active || 0}</dd></div>
            <div><dt className="text-gray-500">Total Users</dt><dd className="font-bold text-lg">{overview?.users?.total || 0}</dd></div>
            <div><dt className="text-gray-500">Active Users</dt><dd className="font-bold text-lg">{overview?.users?.active || 0}</dd></div>
            <div><dt className="text-gray-500">Total Tickets</dt><dd className="font-bold text-lg">{overview?.tickets?.total || 0}</dd></div>
            <div><dt className="text-gray-500">Customers</dt><dd className="font-bold text-lg">{overview?.customers?.total || 0}</dd></div>
          </dl>
        </div>
      </div>
    </div>
  );
}
