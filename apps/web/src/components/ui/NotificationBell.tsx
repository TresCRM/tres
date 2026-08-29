'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
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

const POLL_MS = 30_000;
const RECENT_LIMIT = 8;

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86_400)}d ago`;
}

function entityHref(n: N): string {
  if (n.entityType === 'ticket' && n.entityId) return `/tickets/${n.entityId}`;
  return '/notifications';
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [recent, setRecent] = useState<N[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function refreshCount() {
    try {
      const r = await notificationsApi.unreadCount();
      setCount(r.data.count ?? 0);
    } catch {
      /* ignore — retry on next tick */
    }
  }

  async function loadRecent() {
    setLoading(true);
    try {
      const r = await notificationsApi.list({ limit: RECENT_LIMIT });
      setRecent(r.data.data || []);
    } catch {
      setRecent([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, POLL_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    loadRecent();
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleClickItem(n: N) {
    if (!n.isRead) {
      try { await notificationsApi.markRead(n._id); } catch { /* noop */ }
      setCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
  }

  async function handleMarkAll() {
    try { await notificationsApi.markAllRead(); } catch { /* noop */ }
    setCount(0);
    setRecent((xs) => xs.map((x) => ({ ...x, isRead: true })));
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 min-h-[44px] min-w-[44px] rounded-md hover:bg-gray-100 text-gray-500"
      >
        <Bell size={18} />
        {count > 0 && (
          <span
            className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center"
            aria-hidden
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Notifications"
          className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-1rem)] bg-white border rounded-lg shadow-lg z-40 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-2.5 border-b">
            <span className="text-sm font-semibold">Notifications</span>
            {count > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-xs text-blue-600 hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-[360px] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-xs text-gray-400">Loading…</div>
            ) : recent.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">You're all caught up.</div>
            ) : (
              recent.map((n) => (
                <Link
                  key={n._id}
                  href={entityHref(n)}
                  onClick={() => handleClickItem(n)}
                  className={`block px-4 py-3 border-b last:border-b-0 hover:bg-gray-50 transition-colors ${
                    n.isRead ? 'bg-white' : 'bg-blue-50/40'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{n.title}</p>
                      <p className="text-xs text-gray-500 line-clamp-2">{n.body}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>

          <div className="border-t">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-center text-sm text-blue-600 hover:bg-gray-50"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
