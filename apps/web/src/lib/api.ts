'use client';

import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_BASE_URL,
  withCredentials: true, // send httpOnly cookies
});

let isRefreshing = false;
let waiters: Array<(t:string|null)=>void> = [];

function onRefreshed(token: string|null) {
  waiters.forEach(w => w(token));
  waiters = [];
}

api.interceptors.request.use(async (config) => {
  // token is injected by the API using httpOnly cookie; optionally mirror to header if present
  const token = (window as any).__tc_access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r)=>r,
  async (error) => {
    const { response, config } = error || {};
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
          (window as any).__tc_access_token = data?.accessToken ?? null;
          onRefreshed(data?.accessToken ?? null);
        } catch {
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
