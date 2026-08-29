'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminApi } from '@/lib/apiClient';
import { ArrowLeft, AlertCircle, Loader2, Shield, Building2 } from 'lucide-react';
import Link from 'next/link';

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.users.get(id)
      .then(r => setData(r.data.data))
      .catch(e => setError(e?.response?.data?.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  async function toggleStatus() {
    if (!data) return;
    setBusy(true);
    try {
      const newStatus = data.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
      const r = await adminApi.users.update(id, { status: newStatus });
      setData((prev: any) => ({ ...prev, ...r.data.data }));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Update failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin text-gray-400" /></div>;
  if (!data) return <div className="rounded-xl bg-red-50 border border-red-200 p-6 text-sm text-red-700" role="alert">{error || 'User not found'}</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/users" className="p-2 rounded-md hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Back to users"><ArrowLeft size={20} /></Link>
        <div>
          <h1 className="text-2xl font-bold">{data.firstName} {data.lastName}</h1>
          <p className="text-sm text-gray-500">{data.email}</p>
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-sm text-gray-700">Details</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Status</dt><dd><span className={`text-xs font-medium px-2 py-0.5 rounded ${data.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : data.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{data.status}</span></dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Roles</dt><dd className="flex gap-1 flex-wrap">{data.roles?.map((r: string) => <span key={r} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{r}</span>)}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">MFA</dt><dd className="flex items-center gap-1">{data.mfa?.enabled ? <><Shield size={12} className="text-green-600" /> Enabled</> : 'Disabled'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Joined</dt><dd>{new Date(data.createdAt).toLocaleDateString()}</dd></div>
          </dl>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-sm text-gray-700">Tenant</h2>
          {data.tenant ? (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><Building2 size={18} className="text-blue-600" /></div>
              <div>
                <p className="text-sm font-medium">{data.tenant.branding?.name || data.tenant.slug}</p>
                <p className="text-xs text-gray-500">{data.tenant.slug} &middot; {data.tenant.plan}</p>
              </div>
            </div>
          ) : <p className="text-sm text-gray-500">No tenant info</p>}

          <div className="pt-4 border-t">
            <h3 className="text-sm font-medium mb-2">Actions</h3>
            <button
              onClick={toggleStatus}
              disabled={busy}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors min-h-[40px] ${
                data.status === 'ACTIVE'
                  ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                  : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
              }`}
            >
              {data.status === 'ACTIVE' ? 'Disable User' : 'Enable User'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
