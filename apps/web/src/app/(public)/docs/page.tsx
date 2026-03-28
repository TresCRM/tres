'use client';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

export default function Docs() {
  return (
    <div className="prose mx-auto max-w-5xl px-4 py-10">
      <h1>Developer Docs</h1>
      <SwaggerUI url={`${process.env.NEXT_PUBLIC_API_BASE_URL}/openapi.json`} />
    </div>
  );
}
