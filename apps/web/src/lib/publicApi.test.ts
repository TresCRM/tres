import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * These tests lock in the fix for the regression where portal calls to /public/*
 * were being hit at /api/v1/public/* (404) because the shared axios instance's
 * baseURL included /api/v1. `publicApi` strips the suffix so /public/* resolves
 * at the server root.
 */
describe('publicApi baseURL resolution', () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_API_BASE_URL;

  afterEach(() => {
    vi.resetModules();
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = ORIGINAL;
  });

  test('strips a trailing /api/v1 so /public/* resolves at the root', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:4000/api/v1';
    vi.resetModules();
    const { default: publicApi } = await import('./publicApi');
    expect(publicApi.defaults.baseURL).toBe('http://localhost:4000');
  });

  test('strips a trailing /api/v1/ (with slash) too', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:4000/api/v1/';
    vi.resetModules();
    const { default: publicApi } = await import('./publicApi');
    expect(publicApi.defaults.baseURL).toBe('http://localhost:4000');
  });

  test('leaves a root-only base URL untouched', async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:4000';
    vi.resetModules();
    const { default: publicApi } = await import('./publicApi');
    expect(publicApi.defaults.baseURL).toBe('http://localhost:4000');
  });

  test('falls back to empty string when unset (dev-only)', async () => {
    delete process.env.NEXT_PUBLIC_API_BASE_URL;
    vi.resetModules();
    const { default: publicApi } = await import('./publicApi');
    expect(publicApi.defaults.baseURL).toBe('');
  });
});

describe('portalApi routes /public/* through publicApi', () => {
  const ORIGINAL = process.env.NEXT_PUBLIC_API_BASE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:4000/api/v1';
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetModules();
    if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
    else process.env.NEXT_PUBLIC_API_BASE_URL = ORIGINAL;
  });

  async function loadWithSpy() {
    const publicApiMod = await import('./publicApi');
    const publicApi = publicApiMod.default;
    const postSpy = vi.spyOn(publicApi, 'post').mockResolvedValue({ data: { ok: true } } as any);
    const getSpy = vi.spyOn(publicApi, 'get').mockResolvedValue({ data: { data: [] } } as any);
    const { portalApi } = await import('./apiClient');
    return { portalApi, postSpy, getSpy };
  }

  test('requestPortalAccess posts to /public/tickets/request-portal-access', async () => {
    const { portalApi, postSpy } = await loadWithSpy();
    await portalApi.requestPortalAccess({ email: 'user@example.com', tenantSlug: 'acme' });
    expect(postSpy).toHaveBeenCalledWith(
      '/public/tickets/request-portal-access',
      { email: 'user@example.com', tenantSlug: 'acme' }
    );
  });

  test('createTicket posts to /public/tickets', async () => {
    const { portalApi, postSpy } = await loadWithSpy();
    await portalApi.createTicket({
      subject: 'hi', body: '<p>hi</p>', customerEmail: 'a@b.c', tenantSlug: 'acme',
    });
    expect(postSpy).toHaveBeenCalledWith(
      '/public/tickets',
      { subject: 'hi', body: '<p>hi</p>', customerEmail: 'a@b.c', tenantSlug: 'acme' }
    );
  });

  test('getTicket GETs /public/tickets/:id with token', async () => {
    const { portalApi, getSpy } = await loadWithSpy();
    await portalApi.getTicket('abc123', 'tok');
    expect(getSpy).toHaveBeenCalledWith(
      '/public/tickets/abc123',
      { params: { token: 'tok' } }
    );
  });

  test('listTickets GETs /public/tickets with token + tenantSlug', async () => {
    const { portalApi, getSpy } = await loadWithSpy();
    await portalApi.listTickets({ token: 'tok', tenantSlug: 'acme' });
    expect(getSpy).toHaveBeenCalledWith(
      '/public/tickets',
      { params: { token: 'tok', tenantSlug: 'acme' } }
    );
  });
});
