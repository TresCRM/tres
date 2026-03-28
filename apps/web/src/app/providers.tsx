'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

type Role = 'PUBLIC'|'AGENT'|'OWNER'|'ADMIN';

type Session = {
  userId: string;
  email: string;
  tenantId?: string;
  role: Role;
  token?: string;       // short-lived access token (bearer)
};

const ThemeCtx = createContext<{theme: 'light'|'dark', setTheme: (t:'light'|'dark')=>void}>({theme:'light', setTheme:()=>{}});
export const useThemeMode = () => useContext(ThemeCtx);

const AuthCtx = createContext<{session: Session|null, setSession: (s:Session|null)=>void}>({session:null, setSession:()=>{}});
export const useAuth = () => useContext(AuthCtx);

export default function RootProviders({ children }: {children: React.ReactNode}) {
  const [theme, setTheme] = useState<'light'|'dark'>('light');
  const [session, setSession] = useState<Session|null>(null);
  const [qc] = useState(()=> new QueryClient());

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <ThemeCtx.Provider value={{theme, setTheme}}>
      <AuthCtx.Provider value={{session, setSession}}>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </AuthCtx.Provider>
    </ThemeCtx.Provider>
  );
}
