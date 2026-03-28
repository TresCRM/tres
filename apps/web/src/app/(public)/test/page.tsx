// Editor usage (client component)
"use client";
import { useState } from 'react';
import RichTextEditor from '@/components/editor/RichTextEditor';
import RichTextRenderer from '@/components/editor/RichTextRenderer';

export default function Demo() {
  const [doc, setDoc] = useState<any>(null);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div>
        <h2 className="mb-2 font-semibold">Editor</h2>
        <RichTextEditor
          valueJSON={doc}
          onChangeJSON={setDoc}
          placeholder="Write text, try a code block (toolbar)…"
        />
      </div>
      <div>
        <h2 className="mb-2 font-semibold">Rendered</h2>
        <div className="rounded-2xl border p-3">
          <RichTextRenderer doc={doc} />
        </div>
      </div>
    </div>
  );
}
