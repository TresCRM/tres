'use client';

import { useState } from 'react';
import { useTickets, useCreateTicket, useCloseTicket, useReopenTicket } from '@/hooks/useApi';
import { useForm, Controller } from 'react-hook-form';
import Link from 'next/link';
import { useDebounce } from '@/hooks/useDebounce';
import { SkeletonTicketList } from '@/components/ui/Skeleton';
import { timeAgo } from '@/lib/timeAgo';
import { normalizeFormData, subjectRules, emailRules } from '@/lib/validation';
import { Loader2 } from 'lucide-react';
import RichTextField, { isRichTextEmpty } from '@/components/editor/RichTextField';
import AttachmentUploader from '@/components/attachments/AttachmentUploader';
import { ticketsApi } from '@/lib/apiClient';

export default function TicketsPage() {
  const [filters, setFilters] = useState<{ status?: string; priority?: string; q?: string }>({});
  const debouncedQ = useDebounce(filters.q, 300);
  const { data, isLoading, error } = useTickets({ ...filters, q: debouncedQ || undefined });
  const createMutation = useCreateTicket();
  const closeMutation = useCloseTicket();
  const reopenMutation = useReopenTicket();
  const [showCreate, setShowCreate] = useState(false);

  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<{
    subject: string; body: string; priority: string; customerEmail: string;
  }>({ defaultValues: { priority: 'MEDIUM', body: '' } });

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');

  const onCreateSubmit = async (data: any) => {
    setAttachmentError('');
    const normalized = normalizeFormData(data);
    const result: any = await createMutation.mutateAsync(normalized);
    const newId = result?.data?._id;

    if (newId && pendingFiles.length) {
      setUploadingAttachments(true);
      try {
        for (const file of pendingFiles) {
          await ticketsApi.uploadAttachment(newId, file);
        }
      } catch (e: any) {
        setAttachmentError(
          e?.response?.data?.message
          || 'Ticket was created but one or more attachments failed to upload.'
        );
      } finally {
        setUploadingAttachments(false);
      }
    }

    if (!attachmentError) {
      setShowCreate(false);
      setPendingFiles([]);
      reset();
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Tickets</h1>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm hover:opacity-90 min-h-[44px]"
        >
          {showCreate ? 'Cancel' : '+ New Ticket'}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          className="border rounded-md px-3 py-2 text-sm min-h-[44px]"
          value={filters.status || ''}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value || undefined }))}
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          <option value="OPEN">Open</option>
          <option value="ASSIGNED">Assigned</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="AWAITING_CUSTOMER">Awaiting Customer</option>
          <option value="TRANSFERRED">Transferred</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
          <option value="REOPENED">Reopened</option>
        </select>
        <select
          className="border rounded-md px-3 py-2 text-sm min-h-[44px]"
          value={filters.priority || ''}
          onChange={e => setFilters(f => ({ ...f, priority: e.target.value || undefined }))}
          aria-label="Filter by priority"
        >
          <option value="">All Priority</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
        <input
          type="search"
          placeholder="Search tickets..."
          className="border rounded-md px-3 py-2 text-sm flex-1 min-w-[200px] min-h-[44px]"
          value={filters.q || ''}
          onChange={e => setFilters(f => ({ ...f, q: e.target.value || undefined }))}
          aria-label="Search tickets"
        />
      </div>

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleSubmit(onCreateSubmit)} className="border rounded-xl p-4 mb-6 bg-white shadow-sm space-y-3">
          <div>
            <label htmlFor="subject" className="block text-sm font-medium mb-1">Subject</label>
            <input id="subject" {...register('subject', subjectRules)} aria-invalid={!!errors.subject} aria-describedby={errors.subject ? 'subject-err' : undefined} className="w-full border rounded-md px-3 py-2 text-sm" />
            {errors.subject && <p id="subject-err" role="alert" className="text-red-500 text-xs mt-1">{errors.subject.message}</p>}
          </div>
          <div>
            <label htmlFor="body" className="block text-sm font-medium mb-1">Description</label>
            <Controller
              control={control}
              name="body"
              rules={{ validate: v => !isRichTextEmpty(v) || 'Description is required' }}
              render={({ field }) => (
                <RichTextField
                  id="body"
                  value={field.value || ''}
                  onChange={field.onChange}
                  placeholder="Describe the issue…"
                  ariaInvalid={!!errors.body}
                  ariaDescribedBy={errors.body ? 'body-err' : undefined}
                />
              )}
            />
            {errors.body && <p id="body-err" role="alert" className="text-red-500 text-xs mt-1">{errors.body.message as string}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Attachments</label>
            <AttachmentUploader
              mode="deferred"
              files={pendingFiles}
              onChange={setPendingFiles}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="priority" className="block text-sm font-medium mb-1">Priority</label>
              <select id="priority" {...register('priority')} className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label htmlFor="customerEmail" className="block text-sm font-medium mb-1">Customer Email</label>
              <input id="customerEmail" type="email" {...register('customerEmail', { ...emailRules, required: false })} aria-invalid={!!errors.customerEmail} aria-describedby={errors.customerEmail ? 'customerEmail-err' : undefined} className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
          <button type="submit" disabled={createMutation.isPending || uploadingAttachments} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm min-h-[44px]">
            {createMutation.isPending || uploadingAttachments
              ? <><Loader2 size={16} className="animate-spin" /> {uploadingAttachments ? 'Uploading attachments...' : 'Creating...'}</>
              : 'Create Ticket'}
          </button>
          {createMutation.isError && <p className="text-red-500 text-sm" role="alert">Failed to create ticket</p>}
          {attachmentError && <p className="text-red-500 text-sm" role="alert">{attachmentError}</p>}
        </form>
      )}

      {/* List */}
      {isLoading && <SkeletonTicketList count={5} />}
      {error && <div className="text-red-500" role="alert">Failed to load tickets</div>}
      {data?.data && (
        <div className="space-y-2">
          {data.data.length === 0 && <p className="text-gray-500 py-8 text-center">No tickets found</p>}
          {data.data.map((t: any) => (
            <Link key={t._id} href={`/tickets/${t._id}`} className="block border rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm truncate">{t.subject}</h3>
                  <p className="text-xs text-gray-500 mt-1">{t.customerEmail || 'No customer'} &middot; {timeAgo(t.createdAt)}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    t.status === 'OPEN' ? 'bg-green-100 text-green-700' :
                    t.status === 'ASSIGNED' ? 'bg-blue-100 text-blue-700' :
                    t.status === 'IN_PROGRESS' ? 'bg-indigo-100 text-indigo-700' :
                    t.status === 'AWAITING_CUSTOMER' ? 'bg-amber-100 text-amber-700' :
                    t.status === 'TRANSFERRED' ? 'bg-purple-100 text-purple-700' :
                    t.status === 'RESOLVED' ? 'bg-teal-100 text-teal-700' :
                    t.status === 'CLOSED' ? 'bg-gray-100 text-gray-600' :
                    t.status === 'REOPENED' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{t.status.replace(/_/g, ' ')}</span>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    t.priority === 'CRITICAL' ? 'bg-red-200 text-red-800' :
                    t.priority === 'HIGH' ? 'bg-red-100 text-red-700' :
                    t.priority === 'MEDIUM' ? 'bg-orange-100 text-orange-600' :
                    'bg-blue-100 text-blue-600'
                  }`}>{t.priority}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
