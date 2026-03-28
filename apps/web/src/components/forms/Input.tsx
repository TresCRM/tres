'use client';
import { useField } from 'formik';

export default function Input({label, ...props}:{label?:string; name:string; type?:string; placeholder?:string}) {
  const [field, meta] = useField(props as any);
  const error = meta.touched && meta.error;
  return (
    <div className="space-y-1">
      {label && <label className="text-sm text-gray-700">{label}</label>}
      <input {...field} {...props} className="w-full h-10 px-3 rounded-md border focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]" />
      {error ? <p className="text-xs text-red-600">{meta.error}</p> : null}
    </div>
  );
}
