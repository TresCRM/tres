'use client';

import React from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { github as codeStyle } from 'react-syntax-highlighter/dist/esm/styles/hljs';

type PMNode = {
  type: string;
  text?: string;
  attrs?: any;
  content?: PMNode[];
  marks?: { type: string }[];
};

export default function RichTextRenderer({ doc }:{ doc: { type: 'doc'; content?: PMNode[] } }) {
  if (!doc?.content?.length) return null;
  return <div className="prose max-w-none">{doc.content.map((n, i) => renderNode(n, i))}</div>;
}

function renderNode(node: PMNode, key?: React.Key): React.ReactNode {
  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{renderInline(node)}</p>;
    case 'heading':
      return React.createElement(`h${node.attrs?.level || 1}`, { key }, renderInline(node));
    case 'bulletList':
      return <ul key={key}>{node.content?.map((c, i) => renderNode(c, i))}</ul>;
    case 'orderedList':
      return <ol key={key}>{node.content?.map((c, i) => renderNode(c, i))}</ol>;
    case 'listItem':
      return <li key={key}>{node.content?.map((c, i) => renderNode(c, i))}</li>;
    case 'blockquote':
      return <blockquote key={key}>{node.content?.map((c, i) => renderNode(c, i))}</blockquote>;
    case 'horizontalRule':
      return <hr key={key} />;
    case 'codeBlock': {
      const lang = node.attrs?.language || 'text';
      const code = collectText(node);
      return (
        <div key={key} className="my-3 overflow-auto rounded-xl">
          <SyntaxHighlighter language={lang} style={codeStyle} wrapLongLines>
            {code}
          </SyntaxHighlighter>
        </div>
      );
    }
    default:
      // fallback for unknown nodes
      if (node.content?.length) return <div key={key}>{node.content.map((c, i) => renderNode(c, i))}</div>;
      return null;
  }
}

function renderInline(node: PMNode): React.ReactNode {
  if (!node.content) return null;
  return node.content.map((c, i) => {
    if (c.type === 'text') return renderText(c, i);
    if (c.type === 'hardBreak') return <br key={i} />;
    return renderNode(c, i);
  });
}

function renderText(node: PMNode, key: React.Key) {
  const text = node.text || '';
  const marks = node.marks || [];
  return marks.reduceRight((acc, m) => {
    if (m.type === 'bold') return <strong key={`${key}-b`}>{acc}</strong>;
    if (m.type === 'italic') return <em key={`${key}-i`}>{acc}</em>;
    if (m.type === 'code') return <code key={`${key}-c`}>{acc}</code>;
    return acc;
  }, <React.Fragment key={key}>{text}</React.Fragment>);
}

function collectText(node: PMNode): string {
  if (node.text) return node.text;
  return (node.content || []).map(collectText).join('');
}
