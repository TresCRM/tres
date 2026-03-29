'use client';

import { create } from 'zustand';

export type Role = 'OWNER' | 'ADMIN' | 'AGENT' | 'BILLING' | 'READONLY' | 'INTEGRATION' | 'CUSTOMER';

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
    // Mirror token to window for Axios interceptor
    if (typeof window !== 'undefined') {
      (window as any).__tc_access_token = token;
    }
    set({ user, token, isAuthenticated: true, isLoading: false });
  },

  setToken: (token) => {
    if (typeof window !== 'undefined') {
      (window as any).__tc_access_token = token;
    }
    set({ token });
  },

  clearAuth: () => {
    if (typeof window !== 'undefined') {
      (window as any).__tc_access_token = null;
    }
    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
  },

  setLoading: (isLoading) => set({ isLoading }),
}));
