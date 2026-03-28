'use client';
import React, { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { createLowlight, common } from 'lowlight';

// Register a few common languages (add more as needed)
import ts from 'highlight.js/lib/languages/typescript';
import js from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import xml from 'highlight.js/lib/languages/xml';     // html/xml
import css from 'highlight.js/lib/languages/css';
import yaml from 'highlight.js/lib/languages/yaml';
const lowlight = createLowlight(common);
lowlight.register('typescript', ts);
lowlight.register('javascript', js);
lowlight.register('json', json);
lowlight.register('bash', bash);
lowlight.register('html', xml);
lowlight.register('xml', xml);
lowlight.register('css', css);
lowlight.register('yaml', yaml);

type Props = {
  valueJSON?: any;                // TipTap JSON (preferred)
  valueHTML?: string;             // or initial HTML
  onChangeJSON?: (doc: any) => void;
  onChangeHTML?: (html: string) => void;
  className?: string;
  placeholder?: string;           // visual only
};

const languages = [
  'typescript','javascript','json','bash','html','css','yaml',
] as const;

export default function RichTextEditor({
  valueJSON,
  valueHTML,
  onChangeJSON,
  onChangeHTML,
  className,
  placeholder = 'Write something…',
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,       // we’ll use CodeBlockLowlight
      }),
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'typescript',
      }),
    ],
    content: valueJSON ?? valueHTML ?? '',
    autofocus: false,
    onUpdate({ editor }) {
      onChangeJSON?.(editor.getJSON());
      onChangeHTML?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          'tres-prose min-h-[180px] w-full rounded-2xl border p-3 focus:outline-none',
      },
    },
  }, [valueJSON, valueHTML]);

  useEffect(() => {
    if (!editor) return;
    // placeholder (visual only)
    const el = editor.options.element as HTMLElement;
    el?.style.setProperty('--placeholder', `"${placeholder}"`);
  }, [editor, placeholder]);

  const isCodeBlock = !!editor?.isActive('codeBlock');

  return (
    <div className={className}>
      <Toolbar editor={editor} />
      {isCodeBlock && <LangPicker editor={editor} />}
      <EditorContent editor={editor} />
      <style>{editorCSS}</style>
    </div>
  );
}

function Toolbar({ editor }: { editor: any }) {
  if (!editor) return null;
  const btn = (active: boolean) =>
    `h-8 px-2 rounded-lg text-xs border ${active ? 'bg-gray-100' : ''}`;
  return (
    <div className="mb-2 flex flex-wrap gap-1">
      <button className={btn(editor.isActive('bold'))}
        onClick={() => editor.chain().focus().toggleBold().run()}>Bold</button>
      <button className={btn(editor.isActive('italic'))}
        onClick={() => editor.chain().focus().toggleItalic().run()}>Italic</button>
      <button className={btn(editor.isActive('code'))}
        onClick={() => editor.chain().focus().toggleCode().run()}>Code</button>

      <span className="mx-1 w-px bg-gray-200" />

      {[1,2,3].map(lvl=>(
        <button key={lvl} className={btn(editor.isActive('heading', { level: lvl }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: lvl }).run()}>
          H{lvl}
        </button>
      ))}

      <button className={btn(editor.isActive('bulletList'))}
        onClick={() => editor.chain().focus().toggleBulletList().run()}>Bullets</button>
      <button className={btn(editor.isActive('orderedList'))}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}>Ordered</button>
      <button className={btn(editor.isActive('blockquote'))}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}>Quote</button>
      <button className={btn(editor.isActive('codeBlock'))}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}>Code block</button>

      <span className="mx-1 w-px bg-gray-200" />

      <button className={btn(false)}
        onClick={() => editor.chain().focus().undo().run()}>Undo</button>
      <button className={btn(false)}
        onClick={() => editor.chain().focus().redo().run()}>Redo</button>
      <button className={btn(false)}
        onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}>
        Clear
      </button>
    </div>
  );
}

function LangPicker({ editor }: { editor: any }) {
  const current = editor.getAttributes('codeBlock')?.language || 'typescript';
  return (
    <div className="mb-2">
      <select
        className="h-9 rounded-lg border px-2 text-sm"
        value={current}
        onChange={(e) =>
          editor.chain().focus().updateAttributes('codeBlock', { language: e.target.value }).run()
        }
      >
        {languages.map((l) => (
          <option key={l} value={l}>{l}</option>
        ))}
      </select>
    </div>
  );
}

// Minimal prose styles + placeholder
const editorCSS = `
.tres-prose:empty:before {
  content: var(--placeholder);
  color: #9ca3af;
}
.tres-prose pre {
  background: #0f172a;
  color: #e5e7eb;
  padding: 14px;
  border-radius: 12px;
  overflow: auto;
  font-size: 0.85rem;
}
.tres-prose code:not(pre code) {
  background: #f3f4f6;
  border-radius: 6px;
  padding: 2px 6px;
  font-size: .85rem;
}
.tres-prose blockquote {
  border-left: 3px solid #e5e7eb;
  padding-left: 10px;
  color: #6b7280;
}
`;
