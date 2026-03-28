'use client';
import { useState } from 'react';

export default function ImageKitUploader({ onUploaded, multiple=false, folder='trescrm' }:{
  onUploaded:(files:{url:string; name:string; size:number}[])=>void;
  multiple?: boolean; folder?: string;
}) {
  const [busy, setBusy] = useState(false);

  async function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    setBusy(true);
    try {
      const list:any[] = [];
      for (const f of files) {
        // WARNING: for production, use ImageKit official SDK signed uploads.
        const body = new FormData();
        body.append('file', f);
        body.append('fileName', f.name);
        body.append('folder', folder);
        body.append('publicKey', process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY!);
        const resp = await fetch(`${process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT}/upload`, { method: 'POST', body });
        const data = await resp.json();
        list.push({ url: data.url, name: data.name, size: f.size });
      }
      onUploaded(list);
    } finally { setBusy(false); }
  }

  return (
    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer">
      <input type="file" multiple={multiple} className="hidden" onChange={handle} accept="image/*,.pdf" />
      {busy ? 'Uploading…' : 'Upload'}
    </label>
  );
}
