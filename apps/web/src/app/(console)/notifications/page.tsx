'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, Inbox, Loader2 } from 'lucide-react';
import { notificationsApi } from '@/lib/apiClient';

type N = {
  _id: string;
  type: string;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
  isRead: boolean;
  createdAt: string;
};

type Filter = 'all' | 'unread';

function entityHref(n: N): string | null {
  if (n.entityType === 'ticket' && n.entityId) return `/tickets/${n.entityId}`;
  return null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function NotificationsPage() {
  const [items, setItems] = useState<N[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (reset: boolean) => {
    if (reset) setLoading(true); else setLoadingMore(true);
    setError('');
    try {
      const params: any = { limit: 25 };
      if (filter === 'unread') params.isRead = 'false';
      if (!reset && cursor) params.cursor = cursor;

      const r = await notificationsApi.list(params);
      const data = r.data.data || [];
      setItems((prev) => (reset ? data : [...prev, ...data]));
      setCursor(r.data.cursor || null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filter, cursor]);

  useEffect(() => { load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filter]);

  async function markOne(id: string) {
    try { await notificationsApi.markRead(id); } catch { /* noop */ }
    setItems((xs) => xs.map((x) => (x._id === id ? { ...x, isRead: true } : x)));
  }

  async function markAll() {
    try { await notificationsApi.markAllRead(); } catch { /* noop */ }
    setItems((xs) => xs.map((x) => ({ ...x, isRead: true })));
  }

  const unreadVisible = items.filter((i) => !i.isRead).length;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Bell size={20} className="text-gray-500" />
          <h1 className="text-2xl font-bold">Notifications</h1>
        </div>
        {unreadVisible > 0 && (
          <button
            onClick={markAll}
            className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border hover:bg-gray-50"
          >
            <CheckCheck size={16} /> Mark all as read
          </button>
        )}
      </div>

      <div className="flex gap-2 border-b">
        {(['all', 'unread'] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              filter === f ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {f === 'all' ? 'All' : 'Unread'}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">{error}</div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Inbox size={40} className="text-gray-300 mb-3" />
          <p className="text-sm">{filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}</p>
        </div>
      ) : (
        <ul className="divide-y rounded-lg border bg-white">
          {items.map((n) => {
            const href = entityHref(n);
            const body = (
              <div className="flex items-start gap-3 px-4 py-3">
                {!n.isRead && <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.isRead ? 'text-gray-700' : 'font-semibold text-gray-900'}`}>{n.title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{n.body}</p>
                  <p className="text-xs text-gray-400 mt-1">{formatDate(n.createdAt)}</p>
                </div>
                {!n.isRead && (
                  <button
                    onClick={(e) => { e.preventDefault(); markOne(n._id); }}
                    className="shrink-0 text-xs text-blue-600 hover:underline"
                    aria-label="Mark as read"
                  >
                    Mark read
                  </button>
                )}
              </div>
            );
            return (
              <li key={n._id} className={n.isRead ? 'bg-white' : 'bg-blue-50/40'}>
                {href ? (
                  <Link href={href} onClick={() => !n.isRead && markOne(n._id)} className="block hover:bg-gray-50">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}

      {cursor && !loading && (
        <div className="flex justify-center">
          <button
            onClick={() => load(false)}
            disabled={loadingMore}
            className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
