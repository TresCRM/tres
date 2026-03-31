'use client';

import api from './api';

// ─── Auth ──────────────────────────────────────────

export const authApi = {
  signup: (data: {
    tenant: { name: string; slug: string; plan: string };
    owner: { firstName: string; lastName: string; email: string; password: string };
    branding?: { primaryColor?: string; surfaceColor?: string; logoUrl?: string; emailFrom?: string };
  }) => api.post('/auth/signup', data),

  verify: (data: { email: string; tenantSlug: string; token: string }) =>
    api.post('/auth/verify', data),

  resend: (data: { email: string; tenantSlug: string }) =>
    api.post('/auth/resend', data),

  login: (data: { email: string; password: string; tenantSlug: string }) =>
    api.post('/auth/login', data),

  mfaVerify: (data: { mfaTicket: string; code: string }) =>
    api.post('/auth/mfa-verify', data),

  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post('/auth/change-password', data),

  refresh: () => api.post('/auth/refresh'),

  me: () => api.get('/auth/me'),

  logout: () => api.post('/auth/logout'),

  sessions: () => api.get('/auth/sessions'),

  revokeSession: (id: string) => api.delete(`/auth/sessions/${id}`),

  revokeAllSessions: () => api.delete('/auth/sessions'),
};

// ─── MFA ──────────────────────────────────────────

export const mfaApi = {
  status: () => api.get('/mfa/status'),
  setup: () => api.post('/mfa/setup'),
  verify: (code: string) => api.post('/mfa/verify', { code }),
  disable: (code: string) => api.post('/mfa/disable', { code }),
};

// ─── Tickets ───────────────────────────────────────

export const ticketsApi = {
  list: (params?: { status?: string; priority?: string; assigneeId?: string; q?: string; limit?: number; cursor?: string }) =>
    api.get('/tickets', { params }),

  get: (id: string) => api.get(`/tickets/${id}`),

  create: (data: { subject: string; body: string; priority?: string; customerEmail?: string; tags?: string[] }) =>
    api.post('/tickets', data),

  reply: (id: string, body: string) => api.post(`/tickets/${id}/reply`, { body }),

  assign: (id: string, assigneeId: string) => api.post(`/tickets/${id}/assign`, { assigneeId }),

  reassign: (id: string, assigneeId: string) => api.post(`/tickets/${id}/reassign`, { assigneeId }),

  close: (id: string) => api.post(`/tickets/${id}/close`),

  reopen: (id: string) => api.post(`/tickets/${id}/reopen`),
};

// ─── Customers ─────────────────────────────────────

export const customersApi = {
  list: (params?: { q?: string; limit?: number; cursor?: string }) =>
    api.get('/customers', { params }),

  get: (id: string) => api.get(`/customers/${id}`),

  create: (data: { name: string; email: string; phone?: string; company?: string }) =>
    api.post('/customers', data),

  update: (id: string, data: { name?: string; phone?: string; company?: string }) =>
    api.put(`/customers/${id}`, data),

  remove: (id: string) => api.delete(`/customers/${id}`),
};

// ─── Users ─────────────────────────────────────────

export const usersApi = {
  list: (params?: { status?: string; limit?: number; cursor?: string }) =>
    api.get('/users', { params }),

  get: (id: string) => api.get(`/users/${id}`),

  invite: (data: { email: string; firstName: string; lastName: string; roles: string[] }) =>
    api.post('/users/invite', data),

  updateRoles: (id: string, roles: string[]) => api.put(`/users/${id}/roles`, { roles }),

  updateStatus: (id: string, status: 'ACTIVE' | 'DISABLED') =>
    api.put(`/users/${id}/status`, { status }),

  remove: (id: string) => api.delete(`/users/${id}`),
};

// ─── Subscriptions ─────────────────────────────────

export const subscriptionsApi = {
  me: () => api.get('/subscriptions/me'),
  plans: () => api.get('/subscriptions/plans'),
};

// ─── Settings ──────────────────────────────────────

export const settingsApi = {
  getBranding: () => api.get('/settings/branding'),
  updateBranding: (data: { name?: string; primaryColor?: string; surfaceColor?: string; logoUrl?: string; emailFrom?: string }) =>
    api.put('/settings/branding', data),
};

// ─── Surveys ───────────────────────────────────────

export const surveysApi = {
  analytics: (id: string) => api.get(`/surveys/${id}/analytics`),
  responses: (id: string, params?: { limit?: number; cursor?: string }) =>
    api.get(`/surveys/${id}/responses`, { params }),
};
