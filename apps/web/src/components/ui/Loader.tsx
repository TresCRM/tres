export function Spinner({label}:{label?:string}) {
  return (
    <div className="flex items-center gap-3 justify-center py-8">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[var(--brand-primary)]" />
      {label && <span className="text-sm text-gray-600">{label}</span>}
    </div>
  );
}

export function BlockingLoader({label}:{label?:string}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-white/70 backdrop-blur">
      <Spinner label={label ?? 'Loading...'} />
    </div>
  );
}
