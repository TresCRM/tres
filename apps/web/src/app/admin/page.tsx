'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/apiClient';
import { Building2, Users, Ticket, CreditCard, TrendingUp, AlertCircle } from 'lucide-react';

function StatCard({ label, value, sub, icon: Icon, color }: { label: string; value: number | string; sub?: string; icon: any; color: string }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={20} className="text-white" />
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.analytics.overview()
      .then(r => setData(r.data.data))
      .catch(e => setError(e?.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20" role="status" aria-label="Loading dashboard">
      <div className="animate-spin h-8 w-8 border-3 border-gray-300 border-t-red-600 rounded-full" />
    </div>
  );

  if (error) return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-6 flex items-start gap-3" role="alert">
      <AlertCircle size={20} className="text-red-500 mt-0.5" />
      <div>
        <p className="font-medium text-red-800">Failed to load dashboard</p>
        <p className="text-sm text-red-600 mt-1">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Overview of your TRES CRM platform</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Tenants" value={data?.tenants?.total || 0} sub={`${data?.tenants?.active || 0} active`} icon={Building2} color="bg-blue-600" />
        <StatCard label="Total Users" value={data?.users?.total || 0} sub={`${data?.users?.active || 0} active`} icon={Users} color="bg-green-600" />
        <StatCard label="Total Tickets" value={data?.tickets?.total || 0} sub={`${data?.tickets?.open || 0} open`} icon={Ticket} color="bg-amber-600" />
        <StatCard label="Active Subscriptions" value={data?.subscriptions?.ACTIVE || 0} sub={`${data?.subscriptions?.EXPIRED || 0} expired`} icon={CreditCard} color="bg-purple-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-sm text-gray-700 mb-3">Subscription Breakdown</h2>
          <div className="space-y-2">
            {Object.entries(data?.subscriptions || {}).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{status}</span>
                <span className={`font-semibold px-2 py-0.5 rounded text-xs ${
                  status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                  status === 'EXPIRED' ? 'bg-red-100 text-red-700' :
                  status === 'GRACE' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {String(count)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-sm text-gray-700 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: '/admin/tenants', label: 'Manage Tenants', icon: Building2 },
              { href: '/admin/users', label: 'Manage Users', icon: Users },
              { href: '/admin/tickets', label: 'View Tickets', icon: Ticket },
              { href: '/admin/analytics', label: 'View Analytics', icon: TrendingUp },
            ].map(a => (
              <a key={a.href} href={a.href} className="flex items-center gap-2 px-3 py-2.5 rounded-lg border hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 min-h-[44px]">
                <a.icon size={16} /> {a.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
