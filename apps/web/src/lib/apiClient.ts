'use client';

import api from './api';
import publicApi from './publicApi';

// ─── Auth ──────────────────────────────────────────

export const authApi = {
  signup: (data: {
    tenant: { name: string; slug: string; plan: string };
    owner: { firstName: string; lastName: string; email: string; password: string };
    branding?: { primaryColor?: string; surfaceColor?: string; logoUrl?: string; emailFrom?: string };
  }) => api.post('/auth/signup', data),

  verify: (data: { email: string; tenantSlug: string; token?: string; code?: string }) =>
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

  updateProfile: (data: { firstName?: string; lastName?: string }) =>
    api.put('/auth/profile', data),

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

  uploadAttachment: (ticketId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post(`/tickets/${ticketId}/attachments`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  listAttachments: (ticketId: string) => api.get(`/tickets/${ticketId}/attachments`),

  removeAttachment: (id: string) => api.delete(`/attachments/${id}`),

  assign: (id: string, assigneeId: string) => api.post(`/tickets/${id}/assign`, { assigneeId }),

  reassign: (id: string, assigneeId: string) => api.post(`/tickets/${id}/reassign`, { assigneeId }),

  close: (id: string) => api.post(`/tickets/${id}/close`),

  reopen: (id: string) => api.post(`/tickets/${id}/reopen`),

  resendInvite: (id: string) => api.post(`/tickets/${id}/resend-invite`),
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

// ─── Ticket Templates ─────────────────────────────

export const ticketTemplatesApi = {
  list: (params?: { issueType?: string; isActive?: boolean }) =>
    api.get('/ticket-templates', { params }),
  get: (id: string) => api.get(`/ticket-templates/${id}`),
  create: (data: { name: string; description?: string; issueType?: string; priority?: string; defaultTags?: string[]; bodyTemplate?: string }) =>
    api.post('/ticket-templates', data),
  update: (id: string, data: { name?: string; description?: string; issueType?: string; priority?: string; defaultTags?: string[]; bodyTemplate?: string; isActive?: boolean; sortOrder?: number }) =>
    api.put(`/ticket-templates/${id}`, data),
  remove: (id: string) => api.delete(`/ticket-templates/${id}`),
};

// ─── Service Status ───────────────────────────────

export const serviceStatusApi = {
  get: () => api.get('/service-status'),
  getPublic: (tenantSlug: string) => api.get(`/service-status/public/${tenantSlug}`),
  update: (data: { status: string; title: string; message?: string; components?: { name: string; status: string }[] }) =>
    api.put('/service-status', data),
  createIncident: (data: { title: string; message: string; status?: string }) =>
    api.post('/service-status/incidents', data),
  updateIncident: (index: number, data: { message: string; status: string }) =>
    api.post(`/service-status/incidents/${index}/update`, data),
};

// ─── Portal (Public Ticket API) ──────────────────
// All endpoints below live at /public/* on the server root (NOT under /api/v1),
// so they route through `publicApi`, which strips /api/v1 from the base URL.

export const portalApi = {
  getTicket: (id: string, token: string) =>
    publicApi.get(`/public/tickets/${id}`, { params: { token } }),
  getTimeline: (id: string, token: string) =>
    publicApi.get(`/public/tickets/${id}/timeline`, { params: { token } }),
  replyToTicket: (id: string, token: string, body: string) =>
    publicApi.post(`/public/tickets/${id}/reply`, { body }, { params: { token } }),
  createTicket: (data: { subject: string; body: string; customerEmail: string; customerName?: string; tenantSlug: string }) =>
    publicApi.post('/public/tickets', data),
  uploadAttachment: (ticketId: string, token: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return publicApi.post(`/public/tickets/${ticketId}/attachments`, fd, {
      params: { token },
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  requestAccess: (data: { email: string; ticketId: string; tenantSlug: string }) =>
    publicApi.post('/public/tickets/request-access', data),
  requestPortalAccess: (data: { email: string; tenantSlug: string }) =>
    publicApi.post('/public/tickets/request-portal-access', data),
  listTickets: (params: { token: string; tenantSlug: string }) =>
    publicApi.get('/public/tickets', { params }),
  resolvePortal: (token: string) =>
    publicApi.get('/public/portal/resolve', { params: { token } }),
  getCustomerProfile: (token: string) =>
    publicApi.get('/public/customers/me', { params: { token } }),
  updateCustomerProfile: (token: string, data: { name?: string; phone?: string }) =>
    publicApi.put('/public/customers/me', data, { params: { token } }),
};

// ─── AI Features ─────────────────────────────────

export const aiApi = {
  triage: (ticketId: string) => api.post(`/ai/triage/${ticketId}`),
  suggestReply: (ticketId: string) => api.post(`/ai/suggest-reply/${ticketId}`),
  summarize: (ticketId: string, context?: string) => api.post(`/ai/summarize/${ticketId}`, { context }),
  copilotInsights: () => api.post('/ai/copilot/insights'),
  usage: () => api.get('/ai/usage'),
};

// ─── Knowledge Base ──────────────────────────────

export const knowledgeApi = {
  list: (params?: { status?: string; category?: string; limit?: number; cursor?: string }) =>
    api.get('/knowledge', { params }),
  listPublic: (tenantSlug: string) => api.get('/knowledge/public', { params: { tenantSlug } }),
  get: (id: string) => api.get(`/knowledge/${id}`),
  create: (data: { title: string; category: string; body: string; status?: string }) =>
    api.post('/knowledge', data),
  update: (id: string, data: { title?: string; category?: string; body?: string; status?: string }) =>
    api.put(`/knowledge/${id}`, data),
  remove: (id: string) => api.delete(`/knowledge/${id}`),
  markHelpful: (id: string) => api.post(`/knowledge/${id}/helpful`),
};

// ─── Custom Roles ────────────────────────────────

export const customRolesApi = {
  list: () => api.get('/roles/custom'),
  get: (id: string) => api.get(`/roles/custom/${id}`),
  create: (data: { name: string; description?: string; permissions: string[]; inheritsFrom?: string }) =>
    api.post('/roles/custom', data),
  update: (id: string, data: { name?: string; description?: string; permissions?: string[]; isActive?: boolean }) =>
    api.put(`/roles/custom/${id}`, data),
  remove: (id: string) => api.delete(`/roles/custom/${id}`),
};

// ─── Analytics ───────────────────────────────────

export const analyticsApi = {
  ticketSummary: () => api.get('/analytics/tickets/summary'),
  ticketVolume: (period?: string) => api.get('/analytics/tickets/volume', { params: { period } }),
  slaCompliance: () => api.get('/analytics/tickets/sla'),
  agentPerformance: () => api.get('/analytics/agents/performance'),
  customerIntelligence: () => api.get('/analytics/customers/intelligence'),
  export: (params: { type: string; from?: string; to?: string }) =>
    api.get('/analytics/export', { params, responseType: 'blob' }),
};

// ─── Custom Fields ───────────────────────────────

export const customFieldsApi = {
  list: (params?: { entityType?: string; isActive?: boolean }) =>
    api.get('/custom-fields', { params }),
  get: (id: string) => api.get(`/custom-fields/${id}`),
  create: (data: { entityType: string; name: string; label: string; type: string; options?: string[]; isRequired?: boolean }) =>
    api.post('/custom-fields', data),
  update: (id: string, data: any) => api.put(`/custom-fields/${id}`, data),
  remove: (id: string) => api.delete(`/custom-fields/${id}`),
};

// ─── Video Sessions ──────────────────────────────

export const videoApi = {
  createSession: (data: { ticketId?: string; chatSessionId?: string }) =>
    api.post('/video/sessions', data),
  consent: (id: string) => api.put(`/video/sessions/${id}/consent`),
  start: (id: string) => api.put(`/video/sessions/${id}/start`),
  end: (id: string) => api.put(`/video/sessions/${id}/end`),
  list: () => api.get('/video/sessions'),
};

// ─── Industry Packs ──────────────────────────────

export const industryPacksApi = {
  list: () => api.get('/industry-packs'),
  get: (slug: string) => api.get(`/industry-packs/${slug}`),
  apply: (slug: string) => api.post(`/industry-packs/${slug}/apply`),
};

// ─── Referrals ───────────────────────────────────

export const referralsApi = {
  generate: () => api.post('/referrals/generate'),
  list: () => api.get('/referrals'),
  stats: () => api.get('/referrals/stats'),
};

// ─── Partners ────────────────────────────────────

export const partnersApi = {
  apply: (data: { companyName: string; website?: string; description?: string }) =>
    api.post('/partners/apply', data),
  getApplication: () => api.get('/partners/application'),
  dashboard: () => api.get('/partners/dashboard'),
};

// ─── SLA Policies ─────────────────────────────────

export const slaPoliciesApi = {
  list: () => api.get('/sla-policies'),
  get: (id: string) => api.get(`/sla-policies/${id}`),
  create: (data: { name: string; priority: string; firstResponseMinutes: number; resolutionMinutes: number; businessHoursOnly?: boolean; isDefault?: boolean }) =>
    api.post('/sla-policies', data),
  update: (id: string, data: { name?: string; priority?: string; firstResponseMinutes?: number; resolutionMinutes?: number; businessHoursOnly?: boolean; isDefault?: boolean; isActive?: boolean }) =>
    api.put(`/sla-policies/${id}`, data),
  remove: (id: string) => api.delete(`/sla-policies/${id}`),
};

// ─── Subscriptions ─────────────────────────────────

export const subscriptionsApi = {
  me: () => api.get('/subscriptions/me'),
  plans: () => api.get('/subscriptions/plans'),
  checkout: (data: { planCode: string; interval: string; email: string; callbackUrl: string }) =>
    api.post('/subscriptions/checkout', data),
  verify: (reference: string) => api.post('/subscriptions/verify', { reference }),
  activate: (data: { planCode: string; prepayMonths?: number }) =>
    api.post('/subscriptions', data),
};

// ─── Settings ──────────────────────────────────────

export const settingsApi = {
  getBranding: () => api.get('/settings/branding'),
  updateBranding: (data: { name?: string; primaryColor?: string; surfaceColor?: string; logoUrl?: string; emailFrom?: string }) =>
    api.put('/settings/branding', data),
};

// ─── Messages (Internal) ──────────────────────────

export const messagesApi = {
  send: (data: { type: 'DIRECT' | 'CHANNEL' | 'TICKET_NOTE'; recipientId?: string; channelName?: string; ticketId?: string; content: string }) =>
    api.post('/messages', data),
  directConversation: (userId: string, params?: { limit?: number; cursor?: string }) =>
    api.get(`/messages/direct/${userId}`, { params }),
  channelMessages: (channelName: string, params?: { limit?: number; cursor?: string }) =>
    api.get(`/messages/channels/${channelName}`, { params }),
  ticketNotes: (ticketId: string, params?: { limit?: number; cursor?: string }) =>
    api.get(`/messages/ticket/${ticketId}`, { params }),
  edit: (id: string, content: string) => api.put(`/messages/${id}`, { content }),
  remove: (id: string) => api.delete(`/messages/${id}`),
  markRead: (id: string) => api.post(`/messages/${id}/read`),
  unreadCounts: () => api.get('/messages/unread'),
};

// ─── Chat (Agent-side) ───────────────────────────

export const chatApi = {
  queue: () => api.get('/chat/queue'),
  accept: (sessionId: string) => api.post(`/chat/${sessionId}/accept`),
  reply: (sessionId: string, content: string) => api.post(`/chat/${sessionId}/reply`, { content }),
  transfer: (sessionId: string, targetAgentId: string) => api.post(`/chat/${sessionId}/transfer`, { targetAgentId }),
  end: (sessionId: string) => api.post(`/chat/${sessionId}/end`),
};

// ─── Notifications ────────────────────────────────

export const notificationsApi = {
  list: (params?: { isRead?: boolean; limit?: number; cursor?: string }) =>
    api.get('/notifications', { params }),
  unreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id: string) => api.post(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
};

// ─── Surveys ───────────────────────────────────────

export const surveysApi = {
  analytics: (id: string) => api.get(`/surveys/${id}/analytics`),
  responses: (id: string, params?: { limit?: number; cursor?: string }) =>
    api.get(`/surveys/${id}/responses`, { params }),
};

// ─── Admin API ────────────────────────────────────

export const adminApi = {
  // Plans
  plans: {
    list: () => api.get('/admin/plans'),
    get: (code: string) => api.get(`/admin/plans/${code}`),
    update: (code: string, data: any) => api.put(`/admin/plans/${code}`, data),
    revert: (code: string) => api.delete(`/admin/plans/${code}`),
  },
  // Tenants
  tenants: {
    list: (params?: { plan?: string; isActive?: string; q?: string; limit?: number; cursor?: string }) =>
      api.get('/admin/tenants', { params }),
    get: (id: string) => api.get(`/admin/tenants/${id}`),
    update: (id: string, data: any) => api.put(`/admin/tenants/${id}`, data),
    suspend: (id: string) => api.post(`/admin/tenants/${id}/suspend`),
    activate: (id: string) => api.post(`/admin/tenants/${id}/activate`),
    remove: (id: string, confirmSlug: string) =>
      api.delete(`/admin/tenants/${id}`, { data: { confirmSlug } }),
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
