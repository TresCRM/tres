'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BookOpen, ChevronDown, ChevronRight, Lock, Key, Globe,
  ArrowRight, ExternalLink, Copy, Check,
} from 'lucide-react';

interface PathOp {
  method: string;
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
  security?: any[];
  parameters?: any[];
  requestBody?: any;
  responses?: Record<string, any>;
}

interface Spec {
  info: { title: string; version: string };
  paths: Record<string, Record<string, any>>;
  components?: { schemas?: Record<string, any> };
}

const METHOD_COLORS: Record<string, string> = {
  get: 'bg-green-100 text-green-700 border-green-200',
  post: 'bg-blue-100 text-blue-700 border-blue-200',
  put: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  delete: 'bg-red-100 text-red-700 border-red-200',
  patch: 'bg-purple-100 text-purple-700 border-purple-200',
};

function getAuthLabel(op: PathOp): string {
  if (op.security && op.security.length === 0) return 'Public';
  if (op.path.startsWith('/api/v1/ext/')) return 'API Key';
  if (op.path.startsWith('/public/')) return 'Token';
  return 'Bearer JWT';
}

function getAuthIcon(label: string) {
  if (label === 'Public') return <Globe size={12} />;
  if (label === 'API Key') return <Key size={12} />;
  return <Lock size={12} />;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
      aria-label="Copy to clipboard"
    >
      {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
    </button>
  );
}

function EndpointCard({ op }: { op: PathOp }) {
  const [open, setOpen] = useState(false);
  const authLabel = getAuthLabel(op);

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors min-h-[48px]"
        aria-expanded={open}
      >
        <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded border min-w-[52px] text-center ${METHOD_COLORS[op.method] || 'bg-gray-100'}`}>
          {op.method}
        </span>
        <code className="text-sm font-mono text-gray-700 flex-1 truncate">{op.path}</code>
        <span className="flex items-center gap-1 text-xs text-gray-400 shrink-0">
          {getAuthIcon(authLabel)} {authLabel}
        </span>
        {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t bg-gray-50/50">
          {op.description && <p className="text-sm text-gray-600 mt-3 mb-3">{op.description}</p>}

          {/* Path + copy */}
          <div className="flex items-center gap-2 bg-gray-100 rounded-md px-3 py-2 mb-3">
            <code className="text-xs font-mono flex-1">{op.method.toUpperCase()} {op.path}</code>
            <CopyButton text={op.path} />
          </div>

          {/* Responses */}
          {op.responses && (
            <div className="mt-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Responses</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(op.responses).map(([code, r]: [string, any]) => (
                  <span key={code} className={`text-xs px-2 py-1 rounded-md border ${
                    code.startsWith('2') ? 'bg-green-50 border-green-200 text-green-700' :
                    code.startsWith('4') ? 'bg-orange-50 border-orange-200 text-orange-700' :
                    'bg-gray-50 border-gray-200 text-gray-600'
                  }`}>
                    {code}: {r.description || ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocsPage() {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [error, setError] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:4000/api/v1';
  const origin = apiBase.replace(/\/api\/v1\/?$/, '');
  const specUrl = `${origin}/docs/openapi.json`;

  useEffect(() => {
    fetch(specUrl)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(setSpec)
      .catch(e => setError(`Failed to load API spec: ${e.message}`));
  }, [specUrl]);

  // Group operations by tag
  const grouped = new Map<string, PathOp[]>();
  if (spec) {
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(methods)) {
        if (typeof op !== 'object' || !op) continue;
        const tags = (op as any).tags || ['Other'];
        for (const tag of tags) {
          if (!grouped.has(tag)) grouped.set(tag, []);
          grouped.get(tag)!.push({ method, path, ...(op as any) });
        }
      }
    }
  }

  const tags = Array.from(grouped.keys());
  const filteredTags = activeTag ? [activeTag] : tags;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen size={28} className="text-[var(--brand-primary,#4F46E5)]" />
          <h1 className="text-3xl font-bold">API Documentation</h1>
        </div>
        <p className="text-gray-600 mb-4">
          {spec ? `${Object.keys(spec.paths).length} endpoints across ${tags.length} categories` : 'Loading...'}
        </p>
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="border rounded-lg px-3 py-2 bg-gray-50 flex items-center gap-2">
            <Globe size={14} className="text-gray-400" />
            <span className="text-gray-500">Base:</span>
            <code className="font-mono text-xs">{apiBase}</code>
          </div>
          <div className="border rounded-lg px-3 py-2 bg-gray-50 flex items-center gap-2">
            <Lock size={14} className="text-gray-400" />
            <span className="text-gray-500">Auth:</span>
            <span className="text-xs">Bearer JWT / X-API-Key / Widget Token</span>
          </div>
          <a href={specUrl} target="_blank" rel="noopener noreferrer" className="border rounded-lg px-3 py-2 bg-gray-50 flex items-center gap-2 hover:bg-gray-100 transition-colors text-gray-600">
            <ExternalLink size={14} /> OpenAPI JSON
          </a>
          <a href={`${origin}/docs`} target="_blank" rel="noopener noreferrer" className="border rounded-lg px-3 py-2 bg-gray-50 flex items-center gap-2 hover:bg-gray-100 transition-colors text-gray-600">
            <ExternalLink size={14} /> Swagger UI
          </a>
        </div>
      </div>

      {error && <div className="text-red-500 border border-red-200 rounded-lg p-4 mb-6" role="alert">{error}</div>}

      {spec && (
        <div className="flex gap-8">
          {/* Sidebar: tag filter */}
          <aside className="hidden lg:block w-56 shrink-0">
            <div className="sticky top-20">
              <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Categories</h3>
              <nav className="space-y-0.5">
                <button
                  onClick={() => setActiveTag(null)}
                  className={`block w-full text-left text-sm px-3 py-1.5 rounded-md ${!activeTag ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  All ({Object.keys(spec.paths).length})
                </button>
                {tags.map(t => (
                  <button
                    key={t}
                    onClick={() => setActiveTag(t === activeTag ? null : t)}
                    className={`block w-full text-left text-sm px-3 py-1.5 rounded-md ${activeTag === t ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                  >
                    {t} ({grouped.get(t)?.length})
                  </button>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main: endpoints */}
          <div className="flex-1 min-w-0">
            {/* Mobile tag filter */}
            <div className="lg:hidden mb-4">
              <select
                value={activeTag || ''}
                onChange={e => setActiveTag(e.target.value || null)}
                className="w-full border rounded-md px-3 py-2 text-sm min-h-[44px]"
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                {tags.map(t => <option key={t} value={t}>{t} ({grouped.get(t)?.length})</option>)}
              </select>
            </div>

            {filteredTags.map(tag => (
              <section key={tag} className="mb-8">
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  {tag}
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{grouped.get(tag)?.length}</span>
                </h2>
                <div className="space-y-2">
                  {grouped.get(tag)?.map((op, i) => (
                    <EndpointCard key={`${op.method}-${op.path}-${i}`} op={op} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}

      {!spec && !error && (
        <div className="flex justify-center py-20">
          <div className="animate-spin h-8 w-8 border-4 border-gray-300 border-t-[var(--brand-primary,#4F46E5)] rounded-full" />
        </div>
      )}
    </div>
  );
}
