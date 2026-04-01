'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi } from '@/lib/apiClient';
import { ArrowLeft, Building2, Users, Ticket, CreditCard, AlertCircle, Loader2, Ban, CheckCircle } from 'lucide-react';
import Link from 'next/link';

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.tenants.get(id)
      .then(r => setData(r.data.data))
      .catch(e => setError(e?.response?.data?.message || 'Failed to load tenant'))
      .finally(() => setLoading(false));
  }, [id]);

  async function toggleActive() {
    if (!data) return;
    setBusy(true);
    try {
      const action = data.isActive ? adminApi.tenants.suspend : adminApi.tenants.activate;
      const r = await action(id);
      setData((prev: any) => ({ ...prev, ...r.data.data }));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;
  if (error && !data) return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-6 flex items-start gap-3" role="alert">
      <AlertCircle size={20} className="text-red-500 mt-0.5" />
      <p className="text-sm text-red-700">{error}</p>
    </div>
  );
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/tenants" className="p-2 rounded-md hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Back to tenants">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{data.branding?.name || data.slug}</h1>
          <p className="text-sm text-gray-500">Slug: {data.slug}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">{error}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Building2 size={14} /> Plan</div>
          <p className="font-semibold">{data.plan}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Users size={14} /> Users</div>
          <p className="font-semibold">{data.stats?.userCount || 0} <span className="text-sm font-normal text-gray-400">/ {data.seats} seats</span></p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><Ticket size={14} /> Tickets</div>
          <p className="font-semibold">{data.stats?.ticketCount || 0}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1"><CreditCard size={14} /> Subscription</div>
          <p className="font-semibold">{data.subscription?.status || 'None'}</p>
          {data.subscription?.planCode && <p className="text-xs text-gray-400">{data.subscription.planCode}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-sm text-gray-700 mb-3">Branding</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Primary Color</dt><dd className="flex items-center gap-2"><span className="w-4 h-4 rounded" style={{ background: data.branding?.primaryColor || '#4F46E5' }} />{data.branding?.primaryColor || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Surface Color</dt><dd>{data.branding?.surfaceColor || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Email From</dt><dd>{data.branding?.emailFrom || '—'}</dd></div>
            {data.branding?.logoUrl && <div><dt className="text-gray-500 mb-1">Logo</dt><dd><img src={data.branding.logoUrl} alt="Logo" className="h-10" /></dd></div>}
          </dl>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-sm text-gray-700 mb-3">Actions</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Status</p>
                <p className="text-xs text-gray-500">{data.isActive ? 'Tenant is active' : 'Tenant is suspended'}</p>
              </div>
              <button
                onClick={toggleActive}
                disabled={busy}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors min-h-[40px] ${
                  data.isActive
                    ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                    : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                }`}
              >
                {data.isActive ? <><Ban size={14} /> Suspend</> : <><CheckCircle size={14} /> Activate</>}
              </button>
            </div>
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-400">Created {new Date(data.createdAt).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
