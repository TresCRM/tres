'use client';

import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  withCredentials: true, // send httpOnly cookies
});

// Module-scoped token — not accessible from global window (XSS-safe)
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) { _accessToken = token; }
export function getAccessToken(): string | null { return _accessToken; }

function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

let isRefreshing = false;
let waiters: Array<(t:string|null)=>void> = [];

function onRefreshed(token: string|null) {
  waiters.forEach(w => w(token));
  waiters = [];
}

api.interceptors.request.use((config) => {
  // Attach Bearer token if available (httpOnly cookie is always sent as backup)
  if (_accessToken) config.headers.Authorization = `Bearer ${_accessToken}`;

  // Attach CSRF token on state-changing requests
  const method = (config.method ?? '').toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = getCsrfToken();
    if (csrf) config.headers['x-csrf-token'] = csrf;
  }

  return config;
});

api.interceptors.response.use(
  (r)=>r,
  async (error) => {
    const { response, config } = error || {};

    // MFA enforcement: redirect to setup if API returns mfa_required (only on console pages)
    if (response?.status === 403 && response?.data?.error === 'mfa_required') {
      if (typeof window !== 'undefined') {
        const path = window.location.pathname;
        const isConsolePage = /^\/(dashboard|tickets|customers|staff|billing|settings|reports)/.test(path);
        if (isConsolePage && !path.startsWith('/settings/security')) {
          window.location.href = '/settings/security?setup=required';
        }
      }
      return Promise.reject(error);
    }

    if (response?.status === 401 && !config._retry) {
      config._retry = true;

      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const { data } = await axios.post(
            `${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/refresh`,
            {},
            { withCredentials: true }
          );
          _accessToken = data?.accessToken ?? null;
          onRefreshed(data?.accessToken ?? null);
        } catch {
          _accessToken = null;
          onRefreshed(null);
        } finally {
          isRefreshing = false;
        }
      }

      const token = await new Promise<string|null>(res => waiters.push(res));
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        return api(config);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
