'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

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
      <div className="flex items-center justify-center min-h-screen" role="status" aria-label="Loading">
        <div className="animate-spin h-8 w-8 border-4 border-gray-300 border-t-[var(--brand-primary,#4F46E5)] rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) return null;
  return <>{children}</>;
}
