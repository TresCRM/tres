'use client';

import { useRef, useState } from 'react';
import { Paperclip, X, FileText, Image as ImageIcon, Loader2 } from 'lucide-react';

export const ALLOWED_ATTACHMENT_MIME = ['image/png', 'image/jpeg', 'application/pdf'] as const;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const DEFAULT_MAX_FILES = 5;

export type UploadedAttachment = {
  _id: string;
  filename: string;
  mimeType: string;
  size: number;
  url?: string;
};

type ImmediateProps = {
  mode: 'immediate';
  upload: (file: File) => Promise<UploadedAttachment>;
  value: UploadedAttachment[];
  onChange: (next: UploadedAttachment[]) => void;
  onRemove?: (id: string) => Promise<void> | void;
};
type DeferredProps = {
  mode: 'deferred';
  files: File[];
  onChange: (next: File[]) => void;
};
type Props = (ImmediateProps | DeferredProps) & {
  id?: string;
  disabled?: boolean;
  max?: number;
};

export default function AttachmentUploader(props: Props) {
  const { id, disabled, max = DEFAULT_MAX_FILES } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);

  const validate = (file: File): string | null => {
    if (!(ALLOWED_ATTACHMENT_MIME as readonly string[]).includes(file.type)) {
      return `${file.name}: only PNG, JPEG, or PDF allowed`;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return `${file.name}: exceeds 10 MB`;
    }
    return null;
  };

  const handleAdd = async (incoming: FileList | null) => {
    setError('');
    if (!incoming?.length) return;
    const arr = Array.from(incoming);

    if (props.mode === 'deferred') {
      const queued = [...props.files];
      const errs: string[] = [];
      for (const f of arr) {
        if (queued.length >= max) { errs.push(`Maximum ${max} files allowed`); break; }
        const err = validate(f);
        if (err) { errs.push(err); continue; }
        queued.push(f);
      }
      props.onChange(queued);
      if (errs.length) setError(errs[0]);
    } else {
      let current = [...props.value];
      const errs: string[] = [];
      for (const f of arr) {
        if (current.length >= max) { errs.push(`Maximum ${max} files allowed`); break; }
        const err = validate(f);
        if (err) { errs.push(err); continue; }
        try {
          setUploadingNames(prev => [...prev, f.name]);
          const saved = await props.upload(f);
          current = [...current, saved];
          props.onChange(current);
        } catch (e: any) {
          errs.push(e?.response?.data?.message || `Failed to upload ${f.name}`);
        } finally {
          setUploadingNames(prev => prev.filter(n => n !== f.name));
        }
      }
      if (errs.length) setError(errs[0]);
    }

    if (inputRef.current) inputRef.current.value = '';
  };

  const removeAt = async (idx: number) => {
    if (props.mode === 'deferred') {
      const next = [...props.files];
      next.splice(idx, 1);
      props.onChange(next);
    } else {
      const item = props.value[idx];
      if (props.onRemove) {
        try { await props.onRemove(item._id); } catch { /* best-effort */ }
      }
      const next = [...props.value];
      next.splice(idx, 1);
      props.onChange(next);
    }
  };

  const list = props.mode === 'deferred'
    ? props.files.map(f => ({ name: f.name, mimeType: f.type, size: f.size }))
    : props.value.map(a => ({ name: a.filename, mimeType: a.mimeType, size: a.size }));

  const inputId = id || 'attach-input';

  return (
    <div>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
        className="sr-only"
        disabled={disabled}
        onChange={e => handleAdd(e.target.files)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 px-3 py-2 border rounded-md text-xs font-medium hover:bg-gray-50 disabled:opacity-50 min-h-[36px]"
        >
          <Paperclip size={14} />
          Attach files
        </button>
        <span className="text-[11px] text-gray-500">
          PNG, JPEG, PDF · max 10 MB · up to {max}
        </span>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>
      )}

      {list.length > 0 && (
        <ul className="mt-2 space-y-1">
          {list.map((f, i) => {
            const isUploading = uploadingNames.includes(f.name);
            const Icon = f.mimeType?.startsWith('image/') ? ImageIcon : FileText;
            return (
              <li
                key={`${f.name}-${i}`}
                className="flex items-center justify-between text-xs bg-gray-50 border rounded-md px-2.5 py-1.5"
              >
                <span className="flex items-center gap-2 min-w-0 flex-1">
                  <Icon size={14} className="text-gray-500 shrink-0" />
                  <span className="truncate" title={f.name}>{f.name}</span>
                  <span className="text-gray-400 shrink-0">({Math.max(1, Math.ceil(f.size / 1024))} KB)</span>
                  {isUploading && <Loader2 size={12} className="animate-spin text-gray-400 shrink-0" />}
                </span>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="text-gray-400 hover:text-red-600 ml-2 shrink-0"
                  aria-label={`Remove ${f.name}`}
                >
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
