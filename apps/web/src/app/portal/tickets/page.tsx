'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Loader2 } from 'lucide-react';
import { portalApi } from '@/lib/apiClient';
import { timeAgo } from '@/lib/timeAgo';
import { usePortalAuth } from '../_lib/usePortalAuth';

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-green-100 text-green-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
  AWAITING_CUSTOMER: 'bg-amber-100 text-amber-700',
  RESOLVED: 'bg-teal-100 text-teal-700',
  CLOSED: 'bg-gray-100 text-gray-600',
  REOPENED: 'bg-yellow-100 text-yellow-700',
};

export default function PortalTicketsPage() {
  const { token, tenantSlug, isAuthed } = usePortalAuth();

  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false);
      setError('Your portal session has ended. Please request a new magic link.');
      return;
    }
    if (!tenantSlug) {
      // Single-ticket magic links don't carry the slug. The "view all tickets"
      // endpoint needs it — point the customer at the right flow.
      setLoading(false);
      setError('To see all of your tickets, please request a portal link from the sign-in page.');
      return;
    }
    portalApi.listTickets({ token, tenantSlug })
      .then(res => { setTickets(res.data.data || []); setLoading(false); })
      .catch(() => { setError('Failed to load tickets. Your link may have expired.'); setLoading(false); });
  }, [isAuthed, token, tenantSlug]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">My Tickets</h1>
        <Link
          href={`/portal/tickets/new?token=${encodeURIComponent(token)}&tenant=${encodeURIComponent(tenantSlug)}`}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm font-medium min-h-[44px]"
        >
          <Plus size={16} /> New Ticket
        </Link>
      </div>

      {loading && (
        <div className="text-center py-12">
          <Loader2 size={24} className="animate-spin mx-auto text-gray-400" />
          <p className="text-gray-500 mt-2">Loading your tickets...</p>
        </div>
      )}

      {error && (
        <div className="text-center py-12">
          <p className="text-red-500 mb-2">{error}</p>
          <Link href="/portal/login" className="text-sm text-[var(--brand-primary,#4F46E5)] hover:underline">
            Request a new access link
          </Link>
        </div>
      )}

      {!loading && !error && tickets.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No tickets found.</p>
          <p className="text-sm mt-1">Submit your first support request to get started.</p>
        </div>
      )}

      {!loading && !error && tickets.length > 0 && (
        <div className="space-y-2">
          {tickets.map((t: any) => (
            <Link
              key={t._id}
              href={`/portal/tickets/${t._id}?token=${encodeURIComponent(token)}&tenant=${encodeURIComponent(tenantSlug)}`}
              className="block border rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm truncate">{t.subject}</h3>
                  <p className="text-xs text-gray-500 mt-1">{timeAgo(t.createdAt)}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-600'}`}>
                  {(t.status || '').replace(/_/g, ' ')}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
