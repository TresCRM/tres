'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useEffect } from 'react';
import {
  Bold as BoldIcon, Italic as ItalicIcon, Heading2, List as BulletIcon,
  ListOrdered, Quote, Code as CodeIcon, Undo2, Redo2,
} from 'lucide-react';

type Props = {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  disabled?: boolean;
};

export default function RichTextField({
  id,
  value,
  onChange,
  placeholder = 'Write here…',
  minHeight = 140,
  ariaInvalid,
  ariaDescribedBy,
  disabled,
}: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        horizontalRule: false,
        strike: false,
      }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        class: 'tres-rt-prose px-3 py-2.5 text-sm focus:outline-none',
        style: `min-height:${minHeight}px`,
        ...(ariaInvalid ? { 'aria-invalid': 'true' } : {}),
        ...(ariaDescribedBy ? { 'aria-describedby': ariaDescribedBy } : {}),
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.isEmpty ? '' : editor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = editor.isEmpty ? '' : editor.getHTML();
    if ((value || '') !== current && !editor.isFocused) {
      editor.commands.setContent(value || '', { emitUpdate: false });
    }
  }, [value, editor]);

  return (
    <div className={`border rounded-md bg-white overflow-hidden ${ariaInvalid ? 'border-red-400' : ''}`}>
      <Toolbar editor={editor} disabled={disabled} />
      <EditorContent editor={editor} />
      <style>{`
        .tres-rt-prose { line-height: 1.55; color: #111827; }
        .tres-rt-prose:focus { outline: none; }
        .tres-rt-prose p.is-editor-empty:first-child::before {
          content: '${placeholder.replace(/'/g, "\\'")}';
          color: #9ca3af;
          float: left;
          height: 0;
          pointer-events: none;
        }
        .tres-rt-prose h2 { font-size: 1.125rem; font-weight: 600; margin: 0.5rem 0 0.25rem; }
        .tres-rt-prose h3 { font-size: 1rem; font-weight: 600; margin: 0.5rem 0 0.25rem; }
        .tres-rt-prose ul { list-style: disc; padding-left: 1.25rem; }
        .tres-rt-prose ol { list-style: decimal; padding-left: 1.25rem; }
        .tres-rt-prose blockquote {
          border-left: 3px solid #e5e7eb;
          padding-left: 0.75rem;
          color: #6b7280;
          margin: 0.5rem 0;
        }
        .tres-rt-prose code:not(pre code) {
          background: #f3f4f6;
          padding: 1px 5px;
          border-radius: 4px;
          font-size: 0.875em;
        }
        .tres-rt-prose pre {
          background: #0f172a;
          color: #e5e7eb;
          padding: 0.75rem;
          border-radius: 0.5rem;
          overflow: auto;
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}

function Toolbar({ editor, disabled }: { editor: any; disabled?: boolean }) {
  if (!editor) return null;

  const Btn = ({
    onClick, isActive, label, children,
  }: { onClick: () => void; isActive?: boolean; label: string; children: React.ReactNode }) => (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`h-8 w-8 inline-flex items-center justify-center rounded text-gray-700 hover:bg-gray-200 disabled:opacity-40 disabled:hover:bg-transparent ${
        isActive ? 'bg-gray-200' : ''
      }`}
    >
      {children}
    </button>
  );

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b bg-gray-50 px-1.5 py-1">
      <Btn label="Bold" isActive={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <BoldIcon size={14} />
      </Btn>
      <Btn label="Italic" isActive={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <ItalicIcon size={14} />
      </Btn>
      <Btn label="Inline code" isActive={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
        <CodeIcon size={14} />
      </Btn>
      <span className="mx-1 h-5 w-px bg-gray-300" aria-hidden />
      <Btn label="Heading" isActive={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 size={14} />
      </Btn>
      <Btn label="Bulleted list" isActive={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <BulletIcon size={14} />
      </Btn>
      <Btn label="Numbered list" isActive={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered size={14} />
      </Btn>
      <Btn label="Quote" isActive={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
        <Quote size={14} />
      </Btn>
      <span className="mx-1 h-5 w-px bg-gray-300" aria-hidden />
      <Btn label="Undo" onClick={() => editor.chain().focus().undo().run()}>
        <Undo2 size={14} />
      </Btn>
      <Btn label="Redo" onClick={() => editor.chain().focus().redo().run()}>
        <Redo2 size={14} />
      </Btn>
    </div>
  );
}

/** Returns true if the rich text HTML is effectively empty (no visible content). */
export function isRichTextEmpty(html: string | undefined | null): boolean {
  if (!html) return true;
  const stripped = html.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim();
  return stripped.length === 0;
}
