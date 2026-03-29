'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/lib/apiClient';

// Theme context (keep as-is)
const ThemeCtx = createContext<{theme: 'light'|'dark', setTheme: (t:'light'|'dark')=>void}>({theme:'light', setTheme:()=>{}});
export const useThemeMode = () => useContext(ThemeCtx);

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { setAuth, clearAuth, setLoading } = useAuthStore();

  useEffect(() => {
    // Try to restore session from httpOnly cookie via /me
    authApi.me()
      .then((res) => {
        const { sub, tid, roles } = res.data;
        setAuth(
          { id: sub, email: '', tenantId: tid, tenantSlug: '', roles },
          (window as any).__tc_access_token || ''
        );
      })
      .catch(() => {
        clearAuth();
      });
  }, [setAuth, clearAuth, setLoading]);

  return <>{children}</>;
}

export default function RootProviders({ children }: {children: React.ReactNode}) {
  const [theme, setTheme] = useState<'light'|'dark'>('light');
  const [qc] = useState(()=> new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false },
    },
  }));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeCtx.Provider value={{theme, setTheme}}>
      <QueryClientProvider client={qc}>
        <AuthInitializer>{children}</AuthInitializer>
      </QueryClientProvider>
    </ThemeCtx.Provider>
  );
}
