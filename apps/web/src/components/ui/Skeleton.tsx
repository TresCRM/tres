export function SkeletonLine({ width = '100%', height = '1rem' }: { width?: string; height?: string }) {
  return (
    <div
      className="bg-gray-200 rounded animate-pulse"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="border rounded-xl p-5 space-y-3 bg-white" aria-hidden="true">
      <SkeletonLine width="40%" height="0.75rem" />
      <SkeletonLine width="60%" height="1.75rem" />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <div className="border rounded-xl overflow-hidden bg-white" aria-hidden="true" role="status" aria-label="Loading">
      <div className="bg-gray-50 border-b px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <SkeletonLine key={i} width={`${80 + Math.random() * 40}px`} height="0.75rem" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-3 border-b flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonLine key={c} width={`${60 + Math.random() * 80}px`} height="0.75rem" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonTicketList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true" role="status" aria-label="Loading tickets">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border rounded-lg p-4 bg-white animate-pulse">
          <div className="flex justify-between">
            <div className="space-y-2 flex-1">
              <SkeletonLine width="60%" height="0.875rem" />
              <SkeletonLine width="40%" height="0.625rem" />
            </div>
            <div className="flex gap-2">
              <SkeletonLine width="60px" height="1.25rem" />
              <SkeletonLine width="50px" height="1.25rem" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
