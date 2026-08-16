'use client';

import axios from 'axios';

/**
 * Axios instance for unauthenticated public endpoints mounted at /public/* on the API.
 * These routes are NOT under /api/v1, so we strip that suffix from NEXT_PUBLIC_API_BASE_URL
 * to get the server root, then each caller uses the full `/public/...` path.
 */
function resolveRootBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL || '';
  return raw.replace(/\/api\/v1\/?$/, '');
}

const publicApi = axios.create({
  baseURL: resolveRootBase(),
  withCredentials: false,
});

export default publicApi;
