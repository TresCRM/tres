'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePortalAuth } from '../../_lib/usePortalAuth';
import {
  ArrowLeft, CheckCircle, Clock, AlertTriangle, MessageSquare,
  Shield, Loader2, Send, ArrowRight,
} from 'lucide-react';
import { timeAgo } from '@/lib/timeAgo';
import RichTextField, { isRichTextEmpty } from '@/components/editor/RichTextField';
import AttachmentUploader, { type UploadedAttachment } from '@/components/attachments/AttachmentUploader';
import { portalApi } from '@/lib/apiClient';
import { FileText, Image as ImageIcon } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-green-100 text-green-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-indigo-100 text-indigo-700',
  AWAITING_CUSTOMER: 'bg-amber-100 text-amber-700',
  RESOLVED: 'bg-teal-100 text-teal-700',
  CLOSED: 'bg-gray-100 text-gray-600',
  REOPENED: 'bg-yellow-100 text-yellow-700',
};

const EVENT_ICONS: Record<string, any> = {
  status_change: ArrowRight,
  reply: MessageSquare,
  sla_commitment: Shield,
  sla_met: CheckCircle,
  sla_breached: AlertTriangle,
  created: Clock,
};

const EVENT_COLORS: Record<string, string> = {
  status_change: 'text-blue-500',
  reply: 'text-indigo-500',
  sla_commitment: 'text-purple-500',
  sla_met: 'text-green-500',
  sla_breached: 'text-red-500',
  created: 'text-gray-500',
};

export default function PortalTicketDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { token, qs, isAuthed } = usePortalAuth();

  const [ticket, setTicket] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [replyAttachments, setReplyAttachments] = useState<UploadedAttachment[]>([]);
  const [replying, setReplying] = useState(false);
  const [replySuccess, setReplySuccess] = useState('');

  useEffect(() => {
    if (!isAuthed) {
      setError('Your portal session has ended. Please request a new magic link.');
      setLoading(false);
      return;
    }
    Promise.all([
      portalApi.getTicket(id, token),
      portalApi.getTimeline(id, token),
    ])
      .then(([ticketRes, timelineRes]) => {
        setTicket(ticketRes.data.data);
        setTimeline(timelineRes.data.data?.events || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load ticket. Your link may have expired.');
        setLoading(false);
      });
  }, [id, token, isAuthed]);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRichTextEmpty(replyBody)) return;
    setReplying(true);
    try {
      await portalApi.replyToTicket(id, token, replyBody);
      setReplyBody('');
      setReplyAttachments([]);
      setReplySuccess('Reply sent successfully.');
      const [timelineRes, ticketRes] = await Promise.all([
        portalApi.getTimeline(id, token),
        portalApi.getTicket(id, token),
      ]);
      setTimeline(timelineRes.data.data?.events || []);
      setTicket(ticketRes.data.data);
      setTimeout(() => setReplySuccess(''), 3000);
    } catch {
      setError('Failed to send reply.');
    } finally {
      setReplying(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <Loader2 size={24} className="animate-spin mx-auto text-gray-400" />
        <p className="text-gray-500 mt-2">Loading ticket...</p>
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-2">{error}</p>
        <Link href="/portal/login" className="text-sm text-[var(--brand-primary,#4F46E5)] hover:underline">
          Request a new access link
        </Link>
      </div>
    );
  }

  const backUrl = `/portal/tickets${qs}`;

  return (
    <div>
      <Link href={backUrl} className="text-sm text-[var(--brand-primary,#4F46E5)] hover:underline mb-4 inline-block">
        <ArrowLeft size={14} className="inline mr-1" /> Back to Tickets
      </Link>

      {/* Ticket header */}
      <div className="border rounded-xl bg-white p-6 mb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{ticket?.subject}</h1>
            <p className="text-sm text-gray-500 mt-1">{timeAgo(ticket?.createdAt)}</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[ticket?.status] || 'bg-gray-100'}`}>
            {(ticket?.status || '').replace(/_/g, ' ')}
          </span>
        </div>
        {ticket?.body && (
          <div className="mt-4 text-sm text-gray-700 border-t pt-4 prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: ticket.body }} />
        )}
        {ticket?.attachments?.length > 0 && (
          <PortalAttachmentList attachments={ticket.attachments} />
        )}
      </div>

      {/* Trust Timeline */}
      <div className="border rounded-xl bg-white p-6 mb-6">
        <h2 className="font-medium mb-4">Timeline</h2>
        {timeline.length === 0 ? (
          <p className="text-gray-400 text-sm">No events yet.</p>
        ) : (
          <div className="relative pl-6 space-y-0">
            {/* Vertical line */}
            <div className="absolute left-[11px] top-1 bottom-1 w-0.5 bg-gray-200" />
            {timeline.map((event: any, i: number) => {
              const Icon = EVENT_ICONS[event.type] || Clock;
              const iconColor = EVENT_COLORS[event.type] || 'text-gray-400';
              return (
                <div key={i} className="relative pb-5 last:pb-0">
                  <div className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center`}>
                    <Icon size={12} className={iconColor} />
                  </div>
                  <div className="ml-2">
                    <p className="text-sm font-medium text-gray-800">{event.description}</p>
                    {event.body && (
                      <div className="mt-1 text-sm text-gray-600 bg-gray-50 rounded-md p-3 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: event.body }} />
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {event.actor && <span>{event.actor} &middot; </span>}
                      {timeAgo(event.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reply form */}
      {ticket?.status !== 'CLOSED' && (
        <div className="border rounded-xl bg-white p-6">
          <h2 className="font-medium mb-3">Reply</h2>
          {replySuccess && <p className="text-green-600 text-sm mb-3">{replySuccess}</p>}
          <form onSubmit={handleReply} className="space-y-3">
            <RichTextField
              value={replyBody}
              onChange={setReplyBody}
              placeholder="Type your reply…"
              minHeight={120}
            />
            <AttachmentUploader
              mode="immediate"
              value={replyAttachments}
              onChange={setReplyAttachments}
              upload={async (file) => {
                const r = await portalApi.uploadAttachment(id, token, file);
                return r.data?.data;
              }}
            />
            <button
              type="submit"
              disabled={replying || isRichTextEmpty(replyBody)}
              className="flex items-center gap-2 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm font-medium min-h-[44px] disabled:opacity-60"
            >
              {replying ? <><Loader2 size={16} className="animate-spin" /> Sending...</> : <><Send size={16} /> Send Reply</>}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function PortalAttachmentList({ attachments }: { attachments: any[] }) {
  if (!attachments?.length) return null;
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/api\/v1$/, '') || '';
  return (
    <ul className="mt-4 pt-4 border-t space-y-1.5">
      {attachments.map((a: any) => {
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
