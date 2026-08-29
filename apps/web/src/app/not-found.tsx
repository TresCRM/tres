import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
        <h2 className="text-xl font-semibold mb-2">Page not found</h2>
        <p className="text-gray-500 mb-6">The page you are looking for does not exist or has been moved.</p>
        <Link href="/dashboard" className="px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm inline-block">
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
