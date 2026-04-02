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

// ─── Admin API ────────────────────────────────────

export const adminApi = {
  // Tenants
  tenants: {
    list: (params?: { plan?: string; isActive?: string; q?: string; limit?: number; cursor?: string }) =>
      api.get('/admin/tenants', { params }),
    get: (id: string) => api.get(`/admin/tenants/${id}`),
    update: (id: string, data: any) => api.put(`/admin/tenants/${id}`, data),
    suspend: (id: string) => api.post(`/admin/tenants/${id}/suspend`),
    activate: (id: string) => api.post(`/admin/tenants/${id}/activate`),
  },

  // Users
  users: {
    list: (params?: { status?: string; role?: string; tenantId?: string; q?: string; limit?: number; cursor?: string }) =>
      api.get('/admin/users', { params }),
    get: (id: string) => api.get(`/admin/users/${id}`),
    update: (id: string, data: { status?: string; roles?: string[] }) => api.put(`/admin/users/${id}`, data),
  },

  // Subscriptions
  subscriptions: {
    list: (params?: { status?: string; planCode?: string; limit?: number; cursor?: string }) =>
      api.get('/admin/subscriptions', { params }),
    get: (id: string) => api.get(`/admin/subscriptions/${id}`),
    update: (id: string, data: any) => api.put(`/admin/subscriptions/${id}`, data),
    cancel: (id: string) => api.post(`/admin/subscriptions/${id}/cancel`),
    extendGrace: (id: string, days?: number) => api.post(`/admin/subscriptions/${id}/extend-grace`, { days }),
  },

  // Tickets
  tickets: {
    list: (params?: { status?: string; priority?: string; tenantId?: string; q?: string; limit?: number; cursor?: string }) =>
      api.get('/admin/tickets', { params }),
    get: (id: string) => api.get(`/admin/tickets/${id}`),
    escalate: (id: string, reason?: string) => api.post(`/admin/tickets/${id}/escalate`, { reason }),
  },

  // Analytics
  analytics: {
    overview: () => api.get('/admin/analytics/overview'),
    growth: () => api.get('/admin/analytics/growth'),
    plans: () => api.get('/admin/analytics/plans'),
  },

  // Content
  content: {
    list: (params?: { type?: string; status?: string; limit?: number; cursor?: string }) =>
      api.get('/admin/content', { params }),
    get: (idOrSlug: string) => api.get(`/admin/content/${idOrSlug}`),
    create: (data: { slug: string; title: string; body?: string; type: string; status?: string }) =>
      api.post('/admin/content', data),
    update: (id: string, data: { title?: string; body?: string; status?: string }) =>
      api.put(`/admin/content/${id}`, data),
    remove: (id: string) => api.delete(`/admin/content/${id}`),
  },

  // Audit
  audit: {
    list: (params?: { method?: string; status?: number; route?: string; actorId?: string; tenantId?: string; from?: string; to?: string; limit?: number; cursor?: string }) =>
      api.get('/admin/audit', { params }),
    stats: () => api.get('/admin/audit/stats'),
    exportCsv: (params?: { method?: string; status?: number; route?: string; from?: string; to?: string }) =>
      api.get('/admin/audit/export', { params, responseType: 'blob' }),
  },

  // Errors
  errors: {
    list: (params?: { http?: number; code?: string; route?: string; method?: string; tenantId?: string; from?: string; to?: string; limit?: number; cursor?: string }) =>
      api.get('/admin/errors', { params }),
    stats: () => api.get('/admin/errors/stats'),
  },

  // Settings
  settings: {
    get: () => api.get('/admin/settings'),
    update: (data: any) => api.put('/admin/settings', data),
  },

  // Announcements
  announcements: {
    list: (params?: { isActive?: string; level?: string; limit?: number; cursor?: string }) =>
      api.get('/admin/announcements', { params }),
    active: () => api.get('/admin/announcements/active'),
    create: (data: any) => api.post('/admin/announcements', data),
    update: (id: string, data: any) => api.put(`/admin/announcements/${id}`, data),
    remove: (id: string) => api.delete(`/admin/announcements/${id}`),
  },
};
