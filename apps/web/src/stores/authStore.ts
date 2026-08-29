'use client';

import { create } from 'zustand';
import { setAccessToken } from '@/lib/api';

export type Role = 'OWNER' | 'ADMIN' | 'AGENT' | 'BILLING' | 'READONLY' | 'INTEGRATION' | 'CUSTOMER' | 'SUPER_ADMIN' | 'MANAGER' | 'SALES' | 'CUSTOMER_CARE' | 'SPECIAL';

export interface AuthUser {
  id: string;
  email: string;
  tenantId: string;
  tenantSlug: string;
  roles: Role[];
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: AuthUser, token: string) => void;
  setToken: (token: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,

  setAuth: (user, token) => {
    setAccessToken(token);
    set({ user, token, isAuthenticated: true, isLoading: false });
  },

  setToken: (token) => {
    setAccessToken(token);
    set({ token });
  },

  clearAuth: () => {
    setAccessToken(null);
    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
    // Notify other tabs
    try {
      const bc = new BroadcastChannel('tc_auth');
      bc.postMessage({ type: 'logout' });
      bc.close();
    } catch {}
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
