'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { Loader2, ShieldCheck } from 'lucide-react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/signin');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4" role="status" aria-label="Authenticating">
        <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-[var(--brand-primary,#4F46E5)]" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">Authenticating</p>
          <p className="text-xs text-gray-400 mt-1">Verifying your session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;
  return <>{children}</>;
}
