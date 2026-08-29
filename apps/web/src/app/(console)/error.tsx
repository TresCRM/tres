'use client';

import { useEffect } from 'react';

export default function ConsoleError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('[ConsoleError]', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[400px] px-4">
      <div className="text-center max-w-md">
        <div className="text-4xl mb-4">&#9888;</div>
        <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
        <p className="text-sm text-gray-500 mb-4">This section encountered an error.</p>
        <button
          onClick={reset}
          className="px-4 py-2.5 border rounded-lg text-sm font-medium hover:bg-gray-50 min-h-[44px]"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
