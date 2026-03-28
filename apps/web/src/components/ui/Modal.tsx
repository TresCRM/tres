'use client';
import { ReactNode } from 'react';

export default function Modal({ open, title, children, footer, onClose }:{
  open: boolean; title?: string; children: ReactNode; footer?: ReactNode; onClose?: ()=>void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
      <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
        {title && <div className="text-lg font-semibold mb-2">{title}</div>}
        <div className="prose max-w-none">{children}</div>
        {footer && <div className="mt-4 flex justify-end gap-2">{footer}</div>}
      </div>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 -z-10" />
    </div>
  );
}
