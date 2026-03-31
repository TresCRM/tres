'use client';

import { use, useState } from 'react';
import { useTicket, useReplyTicket, useCloseTicket, useReopenTicket } from '@/hooks/useApi';
import { useForm } from 'react-hook-form';
import Link from 'next/link';
import { timeAgo } from '@/lib/timeAgo';
import { useToast } from '@/components/ui/Toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { bodyRules, normalizeFormData } from '@/lib/validation';
import { Loader2 } from 'lucide-react';

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: ticket, isLoading, error } = useTicket(id);
  const replyMutation = useReplyTicket();
  const closeMutation = useCloseTicket();
  const reopenMutation = useReopenTicket();
  const toast = useToast();
  const [confirmClose, setConfirmClose] = useState(false);

  const { register, handleSubmit, reset, formState: { errors: replyErrors } } = useForm<{ body: string }>();

  const onReply = async (data: { body: string }) => {
    await replyMutation.mutateAsync({ id, body: data.body.trim() });
    reset();
    toast.success('Reply sent');
  };

  if (isLoading) return <div className="text-gray-500 p-8" role="status">Loading ticket...</div>;
  if (error || !ticket) return <div className="text-red-500 p-8" role="alert">Ticket not found</div>;

  return (
    <div>
      <Link href="/tickets" className="text-sm text-[var(--brand-primary,#4F46E5)] hover:underline mb-4 inline-block">&larr; Back to Tickets</Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold">{ticket.subject}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {ticket.customerEmail || 'No customer'} &middot; {timeAgo(ticket.createdAt)}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            ticket.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
            ticket.status === 'CLOSED' ? 'bg-gray-100 text-gray-600' :
            'bg-yellow-100 text-yellow-700'
          }`}>{ticket.status}</span>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            ticket.priority === 'HIGH' ? 'bg-red-100 text-red-700' :
            ticket.priority === 'MEDIUM' ? 'bg-orange-100 text-orange-600' :
            'bg-blue-100 text-blue-600'
          }`}>{ticket.priority}</span>
        </div>
      </div>

      {/* Two-column layout: thread + actions */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Thread */}
        <div>
          {/* Original message */}
          <div className="border rounded-lg p-4 bg-white mb-4">
            <div className="text-sm text-gray-500 mb-2">Original message</div>
            <div className="text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: ticket.body }} />
          </div>

          {/* Comments */}
          {ticket.comments?.map((c: any) => (
            <div key={c._id} className={`border rounded-lg p-4 mb-3 ${c.isAgent ? 'bg-blue-50 border-blue-200' : 'bg-white'}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${c.isAgent ? 'bg-blue-200 text-blue-800' : 'bg-gray-200 text-gray-700'}`}>
                  {c.isAgent ? 'Agent' : 'Customer'}
                </span>
                <span className="text-xs text-gray-400">{timeAgo(c.createdAt)}</span>
              </div>
              <div className="text-sm whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: c.body }} />
            </div>
          ))}

          {/* Reply form */}
          {ticket.status !== 'CLOSED' && (
            <form onSubmit={handleSubmit(onReply)} className="border rounded-lg p-4 bg-white mt-4">
              <label htmlFor="reply-body" className="block text-sm font-medium mb-2">Reply</label>
              <textarea
                id="reply-body"
                rows={3}
                {...register('body', bodyRules)}
                className="w-full border rounded-md px-3 py-2 text-sm mb-3"
                placeholder="Type your reply..."
                aria-invalid={!!replyErrors.body}
              />
              {replyErrors.body && <p className="text-red-500 text-xs mt-1" role="alert">{replyErrors.body.message}</p>}
              <button type="submit" disabled={replyMutation.isPending} className="px-4 py-2 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm font-medium min-h-[44px] flex items-center gap-2">
                {replyMutation.isPending ? <><Loader2 size={16} className="animate-spin" /> Sending...</> : 'Send Reply'}
              </button>
            </form>
          )}
        </div>

        {/* Sidebar actions */}
        <aside className="space-y-4">
          <div className="border rounded-lg p-4 bg-white">
            <h3 className="font-medium text-sm mb-3">Actions</h3>
            <div className="space-y-2">
              {ticket.status !== 'CLOSED' && (
                <button
                  onClick={() => setConfirmClose(true)}
                  disabled={closeMutation.isPending}
                  className="w-full px-3 py-2 border rounded-md text-sm hover:bg-gray-50 min-h-[44px]"
                >
                  {closeMutation.isPending ? 'Closing...' : 'Close Ticket'}
                </button>
              )}
              {ticket.status === 'CLOSED' && (
                <button
                  onClick={() => reopenMutation.mutate(id)}
                  disabled={reopenMutation.isPending}
                  className="w-full px-3 py-2 border rounded-md text-sm hover:bg-gray-50 min-h-[44px]"
                >
                  {reopenMutation.isPending ? 'Reopening...' : 'Reopen Ticket'}
                </button>
              )}
            </div>
          </div>
          <div className="border rounded-lg p-4 bg-white">
            <h3 className="font-medium text-sm mb-3">Details</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-gray-500">Customer</dt>
                <dd>{ticket.customerEmail || '—'}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd>{new Date(ticket.createdAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Tags</dt>
                <dd>{ticket.tags?.join(', ') || '—'}</dd>
              </div>
            </dl>
          </div>
        </aside>
        <ConfirmDialog
          open={confirmClose}
          title="Close Ticket"
          message="Are you sure you want to close this ticket? The customer will be notified."
          confirmLabel="Close Ticket"
          variant="danger"
          loading={closeMutation.isPending}
          onConfirm={async () => {
            await closeMutation.mutateAsync(id);
            toast.success('Ticket closed');
            setConfirmClose(false);
          }}
          onCancel={() => setConfirmClose(false)}
        />
      </div>
    </div>
  );
}
