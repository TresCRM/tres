'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle, AlertTriangle, XCircle, Wrench } from 'lucide-react';
import api from '@/lib/api';
import { timeAgo } from '@/lib/timeAgo';

const STATUS_CONFIG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  OPERATIONAL:    { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', label: 'All Systems Operational' },
  DEGRADED:       { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-50', label: 'Degraded Performance' },
  PARTIAL_OUTAGE: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50', label: 'Partial Outage' },
  MAJOR_OUTAGE:   { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', label: 'Major Outage' },
  MAINTENANCE:    { icon: Wrench, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Maintenance' },
};

const COMPONENT_COLORS: Record<string, string> = {
  OPERATIONAL: 'bg-green-500',
  DEGRADED: 'bg-yellow-500',
  DOWN: 'bg-red-500',
};

export default function PortalStatusPage() {
  const searchParams = useSearchParams();
  const tenantSlug = searchParams.get('tenant') || '';

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tenantSlug) {
      setError('No organization specified.');
      setLoading(false);
      return;
    }
    api.get(`/api/v1/service-status/public/${tenantSlug}`)
      .then(res => { setData(res.data.data); setLoading(false); })
      .catch(() => { setError('Unable to load status.'); setLoading(false); });
  }, [tenantSlug]);

  if (loading) {
    return <div className="text-center py-12"><Loader2 className="animate-spin mx-auto text-gray-400" /></div>;
  }

  if (error) {
    return <div className="text-center py-12 text-gray-500">{error}</div>;
  }

  const cfg = STATUS_CONFIG[data?.status] || STATUS_CONFIG.OPERATIONAL;
  const Icon = cfg.icon;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Service Status</h1>

      {/* Overall status banner */}
      <div className={`border rounded-xl p-6 mb-6 ${cfg.bg}`}>
        <div className="flex items-center gap-3">
          <Icon size={28} className={cfg.color} />
          <div>
            <h2 className={`text-lg font-bold ${cfg.color}`}>{data?.title || cfg.label}</h2>
            {data?.message && <p className="text-sm text-gray-600 mt-1">{data.message}</p>}
          </div>
        </div>
        {data?.updatedAt && (
          <p className="text-xs text-gray-400 mt-3">Last updated {timeAgo(data.updatedAt)}</p>
        )}
      </div>

      {/* Components */}
      {data?.components?.length > 0 && (
        <div className="border rounded-xl bg-white p-6 mb-6">
          <h2 className="font-medium mb-4">Components</h2>
          <div className="space-y-3">
            {data.components.map((c: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                <span className="text-sm font-medium">{c.name}</span>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${COMPONENT_COLORS[c.status] || 'bg-gray-400'}`} />
                  <span className="text-xs text-gray-500">{c.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Incidents */}
      {data?.incidents?.length > 0 && (
        <div className="border rounded-xl bg-white p-6">
          <h2 className="font-medium mb-4">Active Incidents</h2>
          <div className="space-y-4">
            {data.incidents.map((inc: any, i: number) => (
              <div key={i} className="border-l-4 border-red-400 pl-4 py-2">
                <h3 className="font-medium text-sm">{inc.title}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">{inc.status}</span>
                {inc.updates?.map((u: any, j: number) => (
                  <div key={j} className="mt-2">
                    <p className="text-sm text-gray-600">{u.message}</p>
                    <p className="text-xs text-gray-400">{timeAgo(u.createdAt)}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {(!data?.incidents || data.incidents.length === 0) && (
        <div className="border rounded-xl bg-white p-6 text-center text-gray-500 text-sm">
          No active incidents.
        </div>
      )}
    </div>
  );
}
