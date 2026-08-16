'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi } from '@/lib/apiClient';
import { ArrowLeft, Building2, Users, Ticket, CreditCard, AlertCircle, Loader2, Ban, CheckCircle, Trash2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [confirmSlug, setConfirmSlug] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<any>(null);

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

  async function handleDelete() {
    if (!data || confirmSlug !== data.slug) return;
    setDeleting(true);
    setError('');
    try {
      const r = await adminApi.tenants.remove(id, confirmSlug);
      setDeleteResult(r.data);
      // Wait 3 seconds to show the success message, then navigate
      setTimeout(() => router.push('/admin/tenants'), 3500);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Delete failed');
      setDeleting(false);
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

      {/* Danger Zone — SUPER_ADMIN only */}
      <div className="rounded-xl border-2 border-red-300 bg-red-50 p-5 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={20} className="text-red-600 mt-0.5 shrink-0" />
          <div>
            <h2 className="font-semibold text-sm text-red-900">Danger Zone</h2>
            <p className="text-xs text-red-700 mt-1">
              Permanently delete this tenant and ALL associated data — users, tickets, customers,
              subscriptions, messages, and every record tied to this workspace. This action cannot
              be undone.
            </p>
          </div>
        </div>
        <button
          onClick={() => { setShowDeleteDialog(true); setConfirmSlug(''); }}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 min-h-[40px]"
        >
          <Trash2 size={14} /> Delete Tenant Permanently
        </button>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            {deleteResult ? (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle size={24} className="text-green-500" />
                  <h3 className="text-lg font-bold text-gray-900">Tenant Deleted</h3>
                </div>
                <p className="text-sm text-gray-700 mb-4">{deleteResult.message}</p>
                <div className="bg-gray-50 rounded-md p-3 text-xs text-gray-600 max-h-40 overflow-auto">
                  {Object.entries(deleteResult.data?.deletedCounts || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <span>{k}</span>
                      <span className="font-mono">{String(v)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-3">Redirecting to tenant list...</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <AlertTriangle size={24} className="text-red-600" />
                  <h3 id="delete-dialog-title" className="text-lg font-bold text-gray-900">Permanently Delete Tenant</h3>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
                  <p className="text-sm text-red-900 font-medium mb-2">This will permanently remove:</p>
                  <ul className="text-xs text-red-800 space-y-0.5 list-disc list-inside">
                    <li>The tenant <strong>{data.branding?.name || data.slug}</strong></li>
                    <li>{data.stats?.userCount || 0} users</li>
                    <li>{data.stats?.ticketCount || 0} tickets and all comments/attachments</li>
                    <li>All customers, subscriptions, invoices, messages, knowledge articles</li>
                    <li>API keys, webhooks, widget tokens, SLA policies</li>
                    <li>All 30+ related collections</li>
                  </ul>
                </div>
                <p className="text-sm text-gray-700 mb-2">
                  Type <code className="bg-gray-100 px-1.5 py-0.5 rounded font-semibold">{data.slug}</code> below to confirm:
                </p>
                <input
                  type="text"
                  value={confirmSlug}
                  onChange={e => setConfirmSlug(e.target.value)}
                  placeholder={data.slug}
                  className="w-full border rounded-md px-3 py-2.5 text-sm mb-4 font-mono"
                  autoComplete="off"
                  autoFocus
                />
                {error && (
                  <div className="text-sm text-red-700 mb-3">{error}</div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowDeleteDialog(false); setConfirmSlug(''); setError(''); }}
                    disabled={deleting}
                    className="flex-1 px-4 py-2.5 border rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting || confirmSlug !== data.slug}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium disabled:bg-red-300 hover:bg-red-700 min-h-[44px]"
                  >
                    {deleting ? <><Loader2 size={14} className="animate-spin" /> Deleting...</> : <><Trash2 size={14} /> Delete Forever</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
