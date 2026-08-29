'use client';

import { use, useState } from 'react';
import { useTicket, useReplyTicket, useCloseTicket, useReopenTicket } from '@/hooks/useApi';
import { useForm, Controller } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { timeAgo } from '@/lib/timeAgo';
import { useToast } from '@/components/ui/Toast';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { Loader2, FileText, Image as ImageIcon, Send } from 'lucide-react';
import RichTextField, { isRichTextEmpty } from '@/components/editor/RichTextField';
import AttachmentUploader, { type UploadedAttachment } from '@/components/attachments/AttachmentUploader';
import { ticketsApi } from '@/lib/apiClient';

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: ticket, isLoading, error } = useTicket(id);
  const replyMutation = useReplyTicket();
  const closeMutation = useCloseTicket();
  const reopenMutation = useReopenTicket();
  const toast = useToast();
  const qc = useQueryClient();
  const [confirmClose, setConfirmClose] = useState(false);
  const [replyAttachments, setReplyAttachments] = useState<UploadedAttachment[]>([]);
  const [resending, setResending] = useState(false);

  const handleResendInvite = async () => {
    setResending(true);
    try {
      const r = await ticketsApi.resendInvite(id);
      toast.success(`Invite resent to ${r.data?.sentTo || 'customer'}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to resend invite');
    } finally {
      setResending(false);
    }
  };

  const { handleSubmit, reset, control, formState: { errors: replyErrors } } = useForm<{ body: string }>({
    defaultValues: { body: '' },
  });

  const onReply = async (data: { body: string }) => {
    await replyMutation.mutateAsync({ id, body: data.body });
    reset({ body: '' });
    setReplyAttachments([]);
    qc.invalidateQueries({ queryKey: ['tickets', id] });
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
            ticket.status === 'OPEN' ? 'bg-green-100 text-green-700' :
            ticket.status === 'ASSIGNED' ? 'bg-blue-100 text-blue-700' :
            ticket.status === 'IN_PROGRESS' ? 'bg-indigo-100 text-indigo-700' :
            ticket.status === 'AWAITING_CUSTOMER' ? 'bg-amber-100 text-amber-700' :
            ticket.status === 'TRANSFERRED' ? 'bg-purple-100 text-purple-700' :
            ticket.status === 'RESOLVED' ? 'bg-teal-100 text-teal-700' :
            ticket.status === 'CLOSED' ? 'bg-gray-100 text-gray-600' :
            ticket.status === 'REOPENED' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-600'
          }`}>{ticket.status.replace(/_/g, ' ')}</span>
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
            <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: ticket.body }} />
            {ticket.attachments && ticket.attachments.length > 0 && (
              <AttachmentList attachments={ticket.attachments} />
            )}
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
              <div className="prose prose-sm max-w-none text-sm" dangerouslySetInnerHTML={{ __html: c.body }} />
            </div>
          ))}

          {/* Reply form */}
          {ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED' && (
            <form onSubmit={handleSubmit(onReply)} className="border rounded-lg p-4 bg-white mt-4 space-y-3">
              <label htmlFor="reply-body" className="block text-sm font-medium">Reply</label>
              <Controller
                control={control}
                name="body"
                rules={{ validate: v => !isRichTextEmpty(v) || 'Reply cannot be empty' }}
                render={({ field }) => (
                  <RichTextField
                    id="reply-body"
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder="Type your reply…"
                    minHeight={120}
                    ariaInvalid={!!replyErrors.body}
                  />
                )}
              />
              {replyErrors.body && <p className="text-red-500 text-xs" role="alert">{replyErrors.body.message as string}</p>}
              <AttachmentUploader
                mode="immediate"
                value={replyAttachments}
                onChange={setReplyAttachments}
                upload={async (file) => {
                  const r = await ticketsApi.uploadAttachment(id, file);
                  return r.data?.data;
                }}
                onRemove={async (attId) => { await ticketsApi.removeAttachment(attId); }}
              />
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
              {ticket.customerEmail && (
                <button
                  onClick={handleResendInvite}
                  disabled={resending}
                  className="w-full px-3 py-2 border rounded-md text-sm hover:bg-gray-50 min-h-[44px] flex items-center justify-center gap-2"
                  title={`Resend tracking link to ${ticket.customerEmail}`}
                >
                  {resending
                    ? <><Loader2 size={14} className="animate-spin" /> Resending...</>
                    : <><Send size={14} /> Resend Invite Email</>}
                </button>
              )}
              {ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED' && (
                <button
                  onClick={() => setConfirmClose(true)}
                  disabled={closeMutation.isPending}
                  className="w-full px-3 py-2 border rounded-md text-sm hover:bg-gray-50 min-h-[44px]"
                >
                  {closeMutation.isPending ? 'Closing...' : 'Close Ticket'}
                </button>
              )}
              {(ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') && (
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

function AttachmentList({ attachments }: { attachments: any[] }) {
  if (!attachments?.length) return null;
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/api\/v1$/, '') || '';
  return (
    <ul className="mt-3 pt-3 border-t space-y-1">
      {attachments.map((a) => {
        const Icon = a.mimeType?.startsWith('image/') ? ImageIcon : FileText;
        const href = a.url?.startsWith('http') ? a.url : `${apiBase}${a.url}`;
        const infected = a.scanStatus === 'INFECTED';
        return (
          <li key={a._id} className="flex items-center gap-2 text-xs">
            <Icon size={14} className="text-gray-500 shrink-0" />
            {infected ? (
              <span className="text-red-600">{a.filename} (blocked: malware detected)</span>
            ) : (
              <a href={href} target="_blank" rel="noreferrer" className="text-[var(--brand-primary,#4F46E5)] hover:underline truncate">
                {a.filename}
              </a>
            )}
            <span className="text-gray-400">({Math.max(1, Math.ceil((a.size || 0) / 1024))} KB)</span>
            {a.scanStatus === 'PENDING' && <span className="text-amber-600 text-[10px] uppercase">Scanning</span>}
          </li>
        );
      })}
    </ul>
  );
}
