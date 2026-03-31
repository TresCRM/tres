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
    // Only attempt session restore if a session cookie likely exists
    // (tc_role is non-httpOnly, so we can check it as a proxy)
    const hasSession = typeof document !== 'undefined' && document.cookie.includes('tc_role');
    if (!hasSession) {
      setLoading(false);
      return;
    }

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

  // Periodic session validity check — only when authenticated and on console routes
  useEffect(() => {
    const interval = setInterval(() => {
      const { isAuthenticated } = useAuthStore.getState();
      if (!isAuthenticated) return;
      // Don't redirect from public pages
      const path = window.location.pathname;
      const isConsolePage = /^\/(dashboard|tickets|customers|staff|billing|settings|reports)/.test(path);
      if (!isConsolePage) return;

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
          // Only redirect if on a protected page
          const path = window.location.pathname;
          if (/^\/(dashboard|tickets|customers|staff|billing|settings|reports)/.test(path)) {
            window.location.href = '/signin';
          }
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
