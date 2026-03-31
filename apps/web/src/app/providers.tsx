'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/lib/apiClient';
import { getAccessToken, setAccessToken } from '@/lib/api';
import { ToastProvider } from '@/components/ui/Toast';

// Theme context (keep as-is)
const ThemeCtx = createContext<{theme: 'light'|'dark', setTheme: (t:'light'|'dark')=>void}>({theme:'light', setTheme:()=>{}});
export const useThemeMode = () => useContext(ThemeCtx);

const SESSION_CHECK_INTERVAL = 5 * 60 * 1000; // re-check session every 5 minutes

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const { setAuth, clearAuth, setLoading } = useAuthStore();

  useEffect(() => {
    // Try to restore session from httpOnly cookie via /me
    authApi.me()
      .then((res) => {
        const { sub, tid, roles } = res.data;
        setAuth(
          { id: sub, email: '', tenantId: tid, tenantSlug: '', roles },
          getAccessToken() || ''
        );
      })
      .catch(() => {
        clearAuth();
      });
  }, [setAuth, clearAuth, setLoading]);

  // Periodic session validity check
  useEffect(() => {
    const interval = setInterval(() => {
      if (!useAuthStore.getState().isAuthenticated) return;
      authApi.me().catch(() => {
        clearAuth();
        window.location.href = '/signin';
      });
    }, SESSION_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [clearAuth]);

  // Cross-tab logout listener
  useEffect(() => {
    let bc: BroadcastChannel;
    try {
      bc = new BroadcastChannel('tc_auth');
      bc.onmessage = (e) => {
        if (e.data?.type === 'logout') {
          setAccessToken(null);
          useAuthStore.setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
          window.location.href = '/signin';
        }
      };
    } catch {}
    return () => { try { bc?.close(); } catch {} };
  }, []);

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
        <ToastProvider>
          <AuthInitializer>{children}</AuthInitializer>
        </ToastProvider>
      </QueryClientProvider>
    </ThemeCtx.Provider>
  );
}
