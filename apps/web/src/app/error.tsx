'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-4xl font-bold text-red-500 mb-4">Something went wrong</h1>
        <p className="text-gray-600 mb-6">An unexpected error occurred. Please try again.</p>
        <button
          onClick={reset}
          className="px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
