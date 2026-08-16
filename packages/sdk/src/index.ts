// ---------- Types ----------

export type TicketStatus =
  | "OPEN"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "AWAITING_CUSTOMER"
  | "TRANSFERRED"
  | "RESOLVED"
  | "CLOSED"
  | "REOPENED";

export type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Ticket {
  _id: string;
  tenantId: string;
  subject: string;
  body: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId?: string;
  customerEmail?: string;
  tags?: string[];
  watchers?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  statusHistory?: Array<{
    from: string;
    to: string;
    changedBy: string;
    reason?: string;
    timestamp: string;
  }>;
  mergedInto?: string;
  closeReason?: string;
  sla?: {
    policyId?: string;
    firstResponseDue?: string;
    resolutionDue?: string;
    firstRespondedAt?: string;
    resolvedAt?: string;
    firstResponseBreached?: boolean;
    resolutionBreached?: boolean;
  };
}

export interface Comment {
  _id: string;
  tenantId: string;
  ticketId: string;
  authorId: string;
  body: string;
  isAgent: boolean;
  isInternal: boolean;
  createdAt: string;
}

export interface Customer {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TicketTemplate {
  _id: string;
  tenantId: string;
  name: string;
  description?: string;
  issueType?: string;
  priority?: TicketPriority;
  defaultTags?: string[];
  bodyTemplate?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TicketLink {
  _id: string;
  sourceTicketId: string;
  targetTicketId: string;
  relationship: "related" | "parent" | "child" | "blocked_by" | "duplicate";
  createdBy: string;
  createdAt: string;
}

export interface SlaPolicy {
  _id: string;
  tenantId: string;
  name: string;
  priority: TicketPriority | "ALL";
  firstResponseMinutes: number;
  resolutionMinutes: number;
  businessHoursOnly: boolean;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  _id: string;
  tenantId: string;
  senderId: string;
  recipientId?: string;
  channelName?: string;
  ticketId?: string;
  content: string;
  type: "direct" | "channel" | "ticket_note";
  readBy?: string[];
  editedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  _id: string;
  tenantId: string;
  userId: string;
  title: string;
  body: string;
  type: string;
  resourceType?: string;
  resourceId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface Webhook {
  _id: string;
  tenantId: string;
  url: string;
  events: string[];
  secret: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceStatus {
  _id: string;
  tenantId: string;
  overallStatus: "operational" | "degraded" | "partial_outage" | "major_outage";
  services: Array<{
    name: string;
    status: "operational" | "degraded" | "partial_outage" | "major_outage";
  }>;
  incidents: Array<{
    title: string;
    description: string;
    status: "investigating" | "identified" | "monitoring" | "resolved";
    severity: "minor" | "major" | "critical";
    createdAt: string;
    updatedAt: string;
  }>;
  updatedAt: string;
}

export interface ChatSession {
  _id: string;
  tenantId: string;
  visitorId: string;
  visitorName?: string;
  agentId?: string;
  status: "queued" | "active" | "transferred" | "ended";
  messages: Array<{
    sender: "visitor" | "agent";
    content: string;
    timestamp: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  _id: string;
  tenantId: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: string[];
  status: "active" | "invited" | "disabled";
  lastLoginAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CursorResponse<T> {
  data: T[];
  nextCursor?: string;
}

export interface TresCrmConfig {
  baseUrl: string;
  apiKey: string;
  environment?: "sandbox" | "production";
}

// ---------- Errors ----------

export class TresCrmError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "TresCrmError";
  }
}

// ---------- Internal helpers ----------

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface RequestOptions {
  method: HttpMethod;
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

// ---------- Resource helpers ----------

class TicketsResource {
  constructor(private request: <T>(opts: RequestOptions) => Promise<T>) {}

  async list(params: {
    status?: TicketStatus;
    priority?: TicketPriority;
    assigneeId?: string;
    q?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<CursorResponse<Ticket>> {
    return this.request({
      method: "GET",
      path: "/tickets",
      query: params as Record<string, string | number | undefined>,
    });
  }

  async get(id: string): Promise<{ data: Ticket & { comments: Comment[] } }> {
    return this.request({ method: "GET", path: `/tickets/${id}` });
  }

  async create(
    data: {
      subject: string;
      body: string;
      priority?: TicketPriority;
      customerEmail?: string;
      tags?: string[];
      watchers?: string[];
    },
    idempotencyKey?: string,
  ): Promise<{ data: Ticket }> {
    return this.request({
      method: "POST",
      path: "/tickets",
      body: data,
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
    });
  }

  async changeStatus(id: string, status: TicketStatus, reason?: string): Promise<{ data: Ticket }> {
    return this.request({
      method: "POST",
      path: `/tickets/${id}/status`,
      body: { status, reason },
    });
  }

  async reply(id: string, body: string, isInternal?: boolean): Promise<{ data: Comment }> {
    return this.request({
      method: "POST",
      path: `/tickets/${id}/reply`,
      body: { body, isInternal },
    });
  }

  async assign(id: string, assigneeId: string): Promise<{ data: Ticket }> {
    return this.request({
      method: "POST",
      path: `/tickets/${id}/assign`,
      body: { assigneeId },
    });
  }

  async reassign(id: string, assigneeId: string): Promise<{ data: Ticket }> {
    return this.request({
      method: "POST",
      path: `/tickets/${id}/reassign`,
      body: { assigneeId },
    });
  }

  async close(id: string): Promise<{ data: Ticket }> {
    return this.request({ method: "POST", path: `/tickets/${id}/close` });
  }

  async reopen(id: string): Promise<{ data: Ticket }> {
    return this.request({ method: "POST", path: `/tickets/${id}/reopen` });
  }

  async getTransitions(id: string): Promise<{ currentStatus: TicketStatus; allowedTransitions: TicketStatus[] }> {
    return this.request({ method: "GET", path: `/tickets/${id}/transitions` });
  }

  async merge(targetId: string, sourceTicketId: string, reason?: string): Promise<{ data: Ticket }> {
    return this.request({
      method: "POST",
      path: `/tickets/${targetId}/merge`,
      body: { sourceTicketId, reason },
    });
  }

  async link(
    id: string,
    linkedTicketId: string,
    relationship: TicketLink["relationship"],
  ): Promise<{ data: TicketLink }> {
    return this.request({
      method: "POST",
      path: `/tickets/${id}/link`,
      body: { linkedTicketId, relationship },
    });
  }

  async unlink(id: string, linkedTicketId: string): Promise<void> {
    return this.request({
      method: "DELETE",
      path: `/tickets/${id}/link/${linkedTicketId}`,
    });
  }

  async getLinks(id: string): Promise<{ data: TicketLink[] }> {
    return this.request({ method: "GET", path: `/tickets/${id}/links` });
  }
}

class CustomersResource {
  constructor(private request: <T>(opts: RequestOptions) => Promise<T>) {}

  async list(params: {
    q?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<CursorResponse<Customer>> {
    return this.request({
      method: "GET",
      path: "/customers",
      query: params as Record<string, string | number | undefined>,
    });
  }

  async get(id: string): Promise<{ data: Customer }> {
    return this.request({ method: "GET", path: `/customers/${id}` });
  }

  async create(
    data: Pick<Customer, "name" | "email"> &
      Partial<Pick<Customer, "phone" | "company" | "metadata">>,
  ): Promise<{ data: Customer }> {
    return this.request({ method: "POST", path: "/customers", body: data });
  }

  async update(
    id: string,
    data: Partial<Pick<Customer, "name" | "phone" | "company">>,
  ): Promise<{ data: Customer }> {
    return this.request({ method: "PUT", path: `/customers/${id}`, body: data });
  }

  async remove(id: string): Promise<void> {
    return this.request({ method: "DELETE", path: `/customers/${id}` });
  }
}

class TemplatesResource {
  constructor(private request: <T>(opts: RequestOptions) => Promise<T>) {}

  async list(params: {
    issueType?: string;
    isActive?: boolean;
    limit?: number;
    cursor?: string;
  } = {}): Promise<CursorResponse<TicketTemplate>> {
    return this.request({
      method: "GET",
      path: "/ticket-templates",
      query: params as Record<string, string | number | boolean | undefined>,
    });
  }

  async get(id: string): Promise<{ data: TicketTemplate }> {
    return this.request({ method: "GET", path: `/ticket-templates/${id}` });
  }

  async create(data: {
    name: string;
    description?: string;
    issueType?: string;
    priority?: TicketPriority;
    defaultTags?: string[];
    bodyTemplate?: string;
  }): Promise<{ data: TicketTemplate }> {
    return this.request({ method: "POST", path: "/ticket-templates", body: data });
  }

  async update(id: string, data: Partial<{
    name: string;
    description: string;
    issueType: string;
    priority: TicketPriority;
    defaultTags: string[];
    bodyTemplate: string;
    isActive: boolean;
    sortOrder: number;
  }>): Promise<{ data: TicketTemplate }> {
    return this.request({ method: "PUT", path: `/ticket-templates/${id}`, body: data });
  }

  async remove(id: string): Promise<{ data: TicketTemplate }> {
    return this.request({ method: "DELETE", path: `/ticket-templates/${id}` });
  }
}

class SlaPoliciesResource {
  constructor(private request: <T>(opts: RequestOptions) => Promise<T>) {}

  async list(): Promise<{ data: SlaPolicy[] }> {
    return this.request({ method: "GET", path: "/sla-policies" });
  }

  async get(id: string): Promise<{ data: SlaPolicy }> {
    return this.request({ method: "GET", path: `/sla-policies/${id}` });
  }

  async create(data: {
    name: string;
    priority: TicketPriority | "ALL";
    firstResponseMinutes: number;
    resolutionMinutes: number;
    businessHoursOnly?: boolean;
    isDefault?: boolean;
  }): Promise<{ data: SlaPolicy }> {
    return this.request({ method: "POST", path: "/sla-policies", body: data });
  }

  async update(id: string, data: Partial<{
    name: string;
    priority: TicketPriority | "ALL";
    firstResponseMinutes: number;
    resolutionMinutes: number;
    businessHoursOnly: boolean;
    isDefault: boolean;
    isActive: boolean;
  }>): Promise<{ data: SlaPolicy }> {
    return this.request({ method: "PUT", path: `/sla-policies/${id}`, body: data });
  }

  async remove(id: string): Promise<{ data: SlaPolicy }> {
    return this.request({ method: "DELETE", path: `/sla-policies/${id}` });
  }
}

class MessagesResource {
  constructor(private request: <T>(opts: RequestOptions) => Promise<T>) {}

  async send(data: {
    recipientId?: string;
    channelName?: string;
    ticketId?: string;
    content: string;
    type: "direct" | "channel" | "ticket_note";
  }): Promise<{ data: Message }> {
    return this.request({ method: "POST", path: "/messages", body: data });
  }

  async directConversation(
    userId: string,
    params: { limit?: number; cursor?: string } = {},
  ): Promise<CursorResponse<Message>> {
    return this.request({
      method: "GET",
      path: `/messages/direct/${userId}`,
      query: params as Record<string, string | number | undefined>,
    });
  }

  async channelMessages(
    channelName: string,
    params: { limit?: number; cursor?: string } = {},
  ): Promise<CursorResponse<Message>> {
    return this.request({
      method: "GET",
      path: `/messages/channel/${encodeURIComponent(channelName)}`,
      query: params as Record<string, string | number | undefined>,
    });
  }

  async ticketNotes(
    ticketId: string,
    params: { limit?: number; cursor?: string } = {},
  ): Promise<CursorResponse<Message>> {
    return this.request({
      method: "GET",
      path: `/messages/ticket/${ticketId}`,
      query: params as Record<string, string | number | undefined>,
    });
  }

  async edit(id: string, content: string): Promise<{ data: Message }> {
    return this.request({ method: "PATCH", path: `/messages/${id}`, body: { content } });
  }

  async remove(id: string): Promise<void> {
    return this.request({ method: "DELETE", path: `/messages/${id}` });
  }

  async markRead(id: string): Promise<void> {
    return this.request({ method: "POST", path: `/messages/${id}/read` });
  }

  async unreadCounts(): Promise<{ data: Record<string, number> }> {
    return this.request({ method: "GET", path: "/messages/unread-counts" });
  }
}

class NotificationsResource {
  constructor(private request: <T>(opts: RequestOptions) => Promise<T>) {}

  async list(params: { limit?: number; cursor?: string } = {}): Promise<CursorResponse<Notification>> {
    return this.request({
      method: "GET",
      path: "/notifications",
      query: params as Record<string, string | number | undefined>,
    });
  }

  async unreadCount(): Promise<{ count: number }> {
    return this.request({ method: "GET", path: "/notifications/unread-count" });
  }

  async markRead(id: string): Promise<void> {
    return this.request({ method: "POST", path: `/notifications/${id}/read` });
  }

  async markAllRead(): Promise<void> {
    return this.request({ method: "POST", path: "/notifications/read-all" });
  }
}

class WebhooksResource {
  constructor(private request: <T>(opts: RequestOptions) => Promise<T>) {}

  async list(): Promise<{ data: Webhook[] }> {
    return this.request({ method: "GET", path: "/webhooks" });
  }

  async create(data: {
    url: string;
    events: string[];
    secret?: string;
  }): Promise<{ data: Webhook }> {
    return this.request({ method: "POST", path: "/webhooks", body: data });
  }

  async update(id: string, data: Partial<{
    url: string;
    events: string[];
    isActive: boolean;
  }>): Promise<{ data: Webhook }> {
    return this.request({ method: "PUT", path: `/webhooks/${id}`, body: data });
  }

  async remove(id: string): Promise<void> {
    return this.request({ method: "DELETE", path: `/webhooks/${id}` });
  }

  async test(id: string): Promise<{ success: boolean; statusCode?: number }> {
    return this.request({ method: "POST", path: `/webhooks/${id}/test` });
  }
}

class ServiceStatusResource {
  constructor(private request: <T>(opts: RequestOptions) => Promise<T>) {}

  async get(): Promise<{ data: ServiceStatus }> {
    return this.request({ method: "GET", path: "/service-status" });
  }

  async getPublic(tenantSlug: string): Promise<{ data: ServiceStatus }> {
    return this.request({ method: "GET", path: `/service-status/public/${encodeURIComponent(tenantSlug)}` });
  }

  async update(data: Partial<{
    overallStatus: ServiceStatus["overallStatus"];
    services: ServiceStatus["services"];
  }>): Promise<{ data: ServiceStatus }> {
    return this.request({ method: "PUT", path: "/service-status", body: data });
  }

  async createIncident(data: {
    title: string;
    description: string;
    status?: "investigating" | "identified" | "monitoring" | "resolved";
    severity: "minor" | "major" | "critical";
  }): Promise<{ data: ServiceStatus }> {
    return this.request({ method: "POST", path: "/service-status/incidents", body: data });
  }

  async updateIncident(index: number, data: Partial<{
    title: string;
    description: string;
    status: "investigating" | "identified" | "monitoring" | "resolved";
    severity: "minor" | "major" | "critical";
  }>): Promise<{ data: ServiceStatus }> {
    return this.request({ method: "PUT", path: `/service-status/incidents/${index}`, body: data });
  }
}

class ChatResource {
  constructor(private request: <T>(opts: RequestOptions) => Promise<T>) {}

  async queue(): Promise<{ data: ChatSession[] }> {
    return this.request({ method: "GET", path: "/chat/queue" });
  }

  async accept(sessionId: string): Promise<{ data: ChatSession }> {
    return this.request({ method: "POST", path: `/chat/${sessionId}/accept` });
  }

  async reply(sessionId: string, content: string): Promise<{ data: ChatSession }> {
    return this.request({ method: "POST", path: `/chat/${sessionId}/reply`, body: { content } });
  }

  async transfer(sessionId: string, targetAgentId: string): Promise<{ data: ChatSession }> {
    return this.request({ method: "POST", path: `/chat/${sessionId}/transfer`, body: { targetAgentId } });
  }

  async end(sessionId: string): Promise<{ data: ChatSession }> {
    return this.request({ method: "POST", path: `/chat/${sessionId}/end` });
  }
}

class UsersResource {
  constructor(private request: <T>(opts: RequestOptions) => Promise<T>) {}

  async list(params: {
    q?: string;
    role?: string;
    status?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<CursorResponse<User>> {
    return this.request({
      method: "GET",
      path: "/users",
      query: params as Record<string, string | number | undefined>,
    });
  }

  async get(id: string): Promise<{ data: User }> {
    return this.request({ method: "GET", path: `/users/${id}` });
  }

  async invite(data: {
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
  }): Promise<{ data: User }> {
    return this.request({ method: "POST", path: "/users/invite", body: data });
  }

  async updateRoles(id: string, roles: string[]): Promise<{ data: User }> {
    return this.request({ method: "PUT", path: `/users/${id}/roles`, body: { roles } });
  }

  async updateStatus(id: string, status: "active" | "disabled"): Promise<{ data: User }> {
    return this.request({ method: "PUT", path: `/users/${id}/status`, body: { status } });
  }

  async remove(id: string): Promise<void> {
    return this.request({ method: "DELETE", path: `/users/${id}` });
  }
}

class SettingsResource {
  constructor(private request: <T>(opts: RequestOptions) => Promise<T>) {}

  async getBranding(): Promise<{ data: Record<string, unknown> }> {
    return this.request({ method: "GET", path: "/settings/branding" });
  }

  async updateBranding(data: Record<string, unknown>): Promise<{ data: Record<string, unknown> }> {
    return this.request({ method: "PUT", path: "/settings/branding", body: data });
  }
}

// ---------- Client ----------

export class TresCrmClient {
  private baseUrl: string;
  private apiKey: string;
  private environment?: "sandbox" | "production";

  public readonly tickets: TicketsResource;
  public readonly customers: CustomersResource;
  public readonly templates: TemplatesResource;
  public readonly slaPolicies: SlaPoliciesResource;
  public readonly messages: MessagesResource;
  public readonly notifications: NotificationsResource;
  public readonly webhooks: WebhooksResource;
  public readonly serviceStatus: ServiceStatusResource;
  public readonly chat: ChatResource;
  public readonly users: UsersResource;
  public readonly settings: SettingsResource;

  constructor(config: TresCrmConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.environment = config.environment;

    // Validate API key prefix matches declared environment
    if (this.environment) {
      const prefix = this.environment === "sandbox" ? "sk_test_" : "sk_live_";
      if (this.apiKey.startsWith("sk_") && !this.apiKey.startsWith(prefix)) {
        throw new TresCrmError(
          `API key prefix does not match environment "${this.environment}". Expected prefix "${prefix}".`,
          0,
        );
      }
    }

    const boundRequest = this.request.bind(this);
    this.tickets = new TicketsResource(boundRequest);
    this.customers = new CustomersResource(boundRequest);
    this.templates = new TemplatesResource(boundRequest);
    this.slaPolicies = new SlaPoliciesResource(boundRequest);
    this.messages = new MessagesResource(boundRequest);
    this.notifications = new NotificationsResource(boundRequest);
    this.webhooks = new WebhooksResource(boundRequest);
    this.serviceStatus = new ServiceStatusResource(boundRequest);
    this.chat = new ChatResource(boundRequest);
    this.users = new UsersResource(boundRequest);
    this.settings = new SettingsResource(boundRequest);
  }

  /**
   * Verify the HMAC-SHA256 signature of an incoming webhook payload.
   * Use this to validate that a webhook request genuinely originated from TRES CRM.
   */
  static verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const crypto = require("crypto");
    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    if (expected.length !== signature.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  private async request<T>(opts: RequestOptions): Promise<T> {
    const url = new URL(`${this.baseUrl}${opts.path}`);

    if (opts.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...opts.headers,
    };

    const init: RequestInit = {
      method: opts.method,
      headers,
    };

    if (opts.body !== undefined) {
      init.body = JSON.stringify(opts.body);
    }

    const response = await fetch(url.toString(), init);

    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text();
      }
      throw new TresCrmError(
        `API request failed: ${opts.method} ${opts.path} (${response.status})`,
        response.status,
        body,
      );
    }

    return (await response.json()) as T;
  }
}
