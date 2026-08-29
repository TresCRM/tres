'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { portalApi } from '@/lib/apiClient';

const STORAGE_KEY = 'tc_portal_auth';

type Stored = { token: string; tenantSlug: string };

function readStored(): Stored | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    // The token is the identity; tenantSlug is nice-to-have (some magic links,
    // notably older ones, omit it — the JWT already carries the tenant id).
    if (!parsed?.token) return null;
    return { token: parsed.token, tenantSlug: parsed.tenantSlug || '' };
  } catch {
    return null;
  }
}

function writeStored(value: Stored | null) {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage may be blocked — fail silently */
  }
}

/**
 * Portal auth for end customers.
 *
 * Source of truth, in order:
 *   1. Current URL ?token=…&tenant=… (magic-link arrival)
 *   2. sessionStorage (persists across in-portal navigation for the browser tab)
 *
 * On every render where the URL carries a valid pair, the store is refreshed.
 * Clearing (signing out) removes the store; the hook re-reports as unauthed.
 */
export function usePortalAuth() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const urlToken = searchParams.get('token') || '';
  const urlTenant = searchParams.get('tenant') || '';

  const [resolved, setResolved] = useState<Stored | null>(() => {
    if (urlToken) return { token: urlToken, tenantSlug: urlTenant };
    return readStored();
  });

  // Sync URL → storage when a token arrives; preserve stored tenantSlug when
  // the new URL happens to omit it (common for single-ticket magic links).
  useEffect(() => {
    if (urlToken) {
      const prior = readStored();
      const next: Stored = {
        token: urlToken,
        tenantSlug: urlTenant || prior?.tenantSlug || '',
      };
      writeStored(next);
      setResolved(next);
      return;
    }
    const stored = readStored();
    setResolved(stored);
  }, [urlToken, urlTenant]);

  const token = resolved?.token || '';
  const tenantSlug = resolved?.tenantSlug || '';
  // Authed = has a token. tenantSlug is secondary; callers that need it
  // (the "list all tickets" endpoint) should guard separately.
  const isAuthed = !!token;

  // Legacy magic-link rescue: if we have a token but no slug, ask the server
  // to resolve the slug from the token's embedded tenant id. One-shot per
  // token so the full portal UI works even for links emailed before the URL
  // builders started including `&tenant=<slug>`.
  useEffect(() => {
    if (!token || tenantSlug) return;
    let cancelled = false;
    portalApi.resolvePortal(token)
      .then(r => {
        if (cancelled) return;
        const slug = r?.data?.data?.tenantSlug as string | undefined;
        if (!slug) return;
        const next = { token, tenantSlug: slug };
        writeStored(next);
        setResolved(next);
      })
      .catch(() => { /* token invalid/expired; let the caller surface it */ });
    return () => { cancelled = true; };
  }, [token, tenantSlug]);

  // Handy query-string for internal links. Always includes the token so a
  // shared/refreshed URL keeps working; tenant is appended when known.
  const qs = useMemo(() => {
    if (!isAuthed) return '';
    const parts = [`token=${encodeURIComponent(token)}`];
    if (tenantSlug) parts.push(`tenant=${encodeURIComponent(tenantSlug)}`);
    return `?${parts.join('&')}`;
  }, [isAuthed, token, tenantSlug]);

  function signOut() {
    writeStored(null);
    setResolved(null);
    router.push('/portal/login');
  }

  return { token, tenantSlug, qs, isAuthed, pathname, signOut };
}
