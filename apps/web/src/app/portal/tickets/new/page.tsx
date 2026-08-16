'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import RichTextField, { isRichTextEmpty } from '@/components/editor/RichTextField';
import AttachmentUploader from '@/components/attachments/AttachmentUploader';
import { portalApi } from '@/lib/apiClient';

export default function PortalNewTicket() {
  const searchParams = useSearchParams();
  const tenantSlugFromQuery = searchParams.get('tenant') || '';

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [tenantSlug, setTenantSlug] = useState(tenantSlugFromQuery);
  const [files, setFiles] = useState<File[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [partialError, setPartialError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPartialError('');

    if (subject.trim().length < 3) { setError('Subject must be at least 3 characters.'); return; }
    if (isRichTextEmpty(body)) { setError('Please describe your issue.'); return; }
    if (!customerEmail.trim()) { setError('Email is required.'); return; }
    if (!tenantSlug.trim()) { setError('Workspace slug is required.'); return; }

    setSubmitting(true);
    try {
      const res = await portalApi.createTicket({
        subject: subject.trim(),
        body,
        customerEmail: customerEmail.trim().toLowerCase(),
        customerName: customerName.trim() || undefined,
        tenantSlug: tenantSlug.trim().toLowerCase(),
      });
      const ticketId = res.data?.data?.ticketId;
      const accessToken = res.data?.data?.accessToken;

      if (ticketId && accessToken && files.length) {
        const failed: string[] = [];
        for (const f of files) {
          try {
            await portalApi.uploadAttachment(ticketId, accessToken, f);
          } catch {
            failed.push(f.name);
          }
        }
        if (failed.length) {
          setPartialError(`Ticket was created, but some attachments failed to upload: ${failed.join(', ')}`);
        }
      }

      setSubmitted(true);
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || 'Failed to submit ticket. Please try again.';
      setError(typeof msg === 'string' ? msg : 'Failed to submit ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <Link href="/portal/tickets" className="text-sm text-[var(--brand-primary,#4F46E5)] hover:underline mb-4 inline-block">
        <ArrowLeft size={14} className="inline mr-1" /> Back to Tickets
      </Link>

      <h1 className="text-2xl font-bold mb-6">Submit a Support Request</h1>

      {submitted ? (
        <div className="border rounded-xl bg-green-50 p-6 text-center">
          <h2 className="text-lg font-medium text-green-800 mb-2">Ticket Submitted!</h2>
          <p className="text-green-700">Check your email for a tracking link.</p>
          {partialError && <p className="text-amber-700 text-sm mt-3">{partialError}</p>}
          <Link
            href="/portal/tickets"
            className="inline-block mt-4 px-4 py-2 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm"
          >
            View My Tickets
          </Link>
        </div>
      ) : (
        <form className="border rounded-xl bg-white p-6 space-y-4" onSubmit={handleSubmit}>
          {!tenantSlugFromQuery && (
            <div>
              <label htmlFor="tenantSlug" className="block text-sm font-medium mb-1">Workspace</label>
              <input
                id="tenantSlug"
                type="text"
                required
                value={tenantSlug}
                onChange={e => setTenantSlug(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="workspace-slug"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="customerEmail" className="block text-sm font-medium mb-1">Your Email</label>
              <input
                id="customerEmail"
                type="email"
                required
                value={customerEmail}
                onChange={e => setCustomerEmail(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="customerName" className="block text-sm font-medium mb-1">Your Name <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                id="customerName"
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="subject" className="block text-sm font-medium mb-1">Subject</label>
            <input
              id="subject"
              type="text"
              required
              minLength={3}
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
              placeholder="Brief description of your issue"
            />
          </div>

          <div>
            <label htmlFor="body" className="block text-sm font-medium mb-1">Description</label>
            <RichTextField
              id="body"
              value={body}
              onChange={setBody}
              placeholder="Please describe your issue in detail…"
              minHeight={160}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Attachments</label>
            <AttachmentUploader mode="deferred" files={files} onChange={setFiles} />
          </div>

          {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm min-h-[44px] disabled:opacity-60"
          >
            {submitting ? <><Loader2 size={16} className="animate-spin" /> Submitting…</> : 'Submit Ticket'}
          </button>
        </form>
      )}
    </div>
  );
}
