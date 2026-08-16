/**
 * @module packages/types/roles
 * Canonical role definitions, permission matrix, and role hierarchy for TRES CRM.
 * Single source of truth -- imported by API, web, and workers.
 */

// ─── Roles ───────────────────────────────────────────────────────────

export const ROLES = [
  // Tenant-scoped roles
  "OWNER",
  "ADMIN",
  "AGENT",
  "BILLING",
  "READONLY",
  "INTEGRATION",
  "CUSTOMER",
  // Platform admin roles
  "SUPER_ADMIN",
  "MANAGER",
  "SALES",
  "CUSTOMER_CARE",
  "SPECIAL",
] as const;

export type Role = (typeof ROLES)[number];

/** Human-readable labels */
export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Account Owner",
  ADMIN: "Administrator",
  AGENT: "Support Agent",
  BILLING: "Billing Manager",
  READONLY: "Read Only",
  INTEGRATION: "API Integration",
  CUSTOMER: "Customer",
  SUPER_ADMIN: "Super Administrator",
  MANAGER: "Platform Manager",
  SALES: "Sales Representative",
  CUSTOMER_CARE: "Customer Care Agent",
  SPECIAL: "Special Operations",
};

/**
 * Role hierarchy (higher index = higher privilege).
 * Used by `hasMinRole()` -- a user with ADMIN automatically satisfies AGENT checks.
 * Roles not in the hierarchy (BILLING, INTEGRATION, CUSTOMER) are lateral --
 * they must be checked explicitly.
 */
const HIERARCHY: Role[] = ["READONLY", "AGENT", "ADMIN", "OWNER"];

/** Admin hierarchy — separate from tenant hierarchy */
const ADMIN_HIERARCHY: Role[] = ["CUSTOMER_CARE", "SALES", "MANAGER", "SUPER_ADMIN"];

/** Lateral roles that exist outside the main hierarchy */
const LATERAL_ROLES: Set<Role> = new Set(["BILLING", "INTEGRATION", "CUSTOMER", "SPECIAL"]);

/** All platform admin roles */
export const ADMIN_ROLES: ReadonlySet<Role> = new Set(["SUPER_ADMIN", "MANAGER", "SALES", "CUSTOMER_CARE", "SPECIAL"]);

/** Check if a role is a platform admin role */
export function isAdminRole(role: Role): boolean {
  return ADMIN_ROLES.has(role);
}

/**
 * Check if `userRole` meets or exceeds `requiredRole` in the hierarchy.
 * Returns false for lateral roles -- those must be checked by name.
 */
export function meetsHierarchy(userRole: Role, requiredRole: Role): boolean {
  // Check tenant hierarchy
  const userIdx = HIERARCHY.indexOf(userRole);
  const reqIdx = HIERARCHY.indexOf(requiredRole);
  if (userIdx !== -1 && reqIdx !== -1) return userIdx >= reqIdx;
  // Check admin hierarchy
  const adminUserIdx = ADMIN_HIERARCHY.indexOf(userRole);
  const adminReqIdx = ADMIN_HIERARCHY.indexOf(requiredRole);
  if (adminUserIdx !== -1 && adminReqIdx !== -1) return adminUserIdx >= adminReqIdx;
  return false; // lateral role or cross-hierarchy
}

/**
 * Check if any of the user's roles meet the minimum required role (hierarchy)
 * OR exactly match a lateral role requirement.
 */
export function hasRole(userRoles: Role[], requiredRole: Role): boolean {
  if (LATERAL_ROLES.has(requiredRole)) {
    return userRoles.includes(requiredRole);
  }
  return userRoles.some((r) => meetsHierarchy(r, requiredRole));
}

// ─── Permissions ─────────────────────────────────────────────────────

export const PERMISSIONS = [
  // Tickets
  "TICKET_CREATE",
  "TICKET_READ",
  "TICKET_UPDATE",
  "TICKET_CLOSE",
  "TICKET_ASSIGN",
  "TICKET_REOPEN",

  // Comments
  "COMMENT_CREATE",
  "COMMENT_READ",

  // Customers
  "CUSTOMER_CREATE",
  "CUSTOMER_READ",
  "CUSTOMER_UPDATE",

  // Users / Staff
  "USER_INVITE",
  "USER_READ",
  "USER_UPDATE",
  "USER_DISABLE",

  // Billing & Subscriptions
  "BILLING_READ",
  "BILLING_MANAGE",

  // Surveys
  "SURVEY_CREATE",
  "SURVEY_READ",
  "SURVEY_SEND",

  // Emails
  "EMAIL_TEMPLATE_MANAGE",
  "EMAIL_SEND",

  // Logs & Audit
  "LOG_READ",

  // Settings
  "SETTINGS_READ",
  "SETTINGS_UPDATE",

  // Admin
  "ADMIN_PANEL_ACCESS",

  // Ownership (non-hierarchical, OWNER-only)
  "OWNERSHIP_TRANSFER",

  // ─── Platform Admin Permissions ───────────────────
  "ADMIN_TENANT_READ",
  "ADMIN_TENANT_UPDATE",
  "ADMIN_TENANT_SUSPEND",
  "ADMIN_TENANT_DELETE",
  "ADMIN_USER_READ",
  "ADMIN_USER_UPDATE",
  "ADMIN_USER_IMPERSONATE",
  "ADMIN_SUBSCRIPTION_READ",
  "ADMIN_SUBSCRIPTION_UPDATE",
  "ADMIN_SUBSCRIPTION_CANCEL",
  "ADMIN_TICKET_READ",
  "ADMIN_TICKET_ESCALATE",
  "ADMIN_CONTENT_READ",
  "ADMIN_CONTENT_UPDATE",
  "ADMIN_ANALYTICS_READ",
  "ADMIN_AUDIT_READ",
  "ADMIN_SETTINGS_READ",
  "ADMIN_SETTINGS_UPDATE",
  "ADMIN_ANNOUNCEMENT_CREATE",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Role -> Permission mapping.
 * Each role grants a specific set of permissions.
 * OWNER inherits everything from ADMIN, which inherits from AGENT, etc.
 * This is flattened -- no need to walk the hierarchy at runtime.
 */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set([
    // Everything
    "TICKET_CREATE", "TICKET_READ", "TICKET_UPDATE", "TICKET_CLOSE", "TICKET_ASSIGN", "TICKET_REOPEN",
    "COMMENT_CREATE", "COMMENT_READ",
    "CUSTOMER_CREATE", "CUSTOMER_READ", "CUSTOMER_UPDATE",
    "USER_INVITE", "USER_READ", "USER_UPDATE", "USER_DISABLE",
    "BILLING_READ", "BILLING_MANAGE",
    "SURVEY_CREATE", "SURVEY_READ", "SURVEY_SEND",
    "EMAIL_TEMPLATE_MANAGE", "EMAIL_SEND",
    "LOG_READ",
    "SETTINGS_READ", "SETTINGS_UPDATE",
    "ADMIN_PANEL_ACCESS",
    "OWNERSHIP_TRANSFER",
  ]),

  ADMIN: new Set([
    // Everything except ownership transfer and billing management
    "TICKET_CREATE", "TICKET_READ", "TICKET_UPDATE", "TICKET_CLOSE", "TICKET_ASSIGN", "TICKET_REOPEN",
    "COMMENT_CREATE", "COMMENT_READ",
    "CUSTOMER_CREATE", "CUSTOMER_READ", "CUSTOMER_UPDATE",
    "USER_INVITE", "USER_READ", "USER_UPDATE", "USER_DISABLE",
    "BILLING_READ",
    "SURVEY_CREATE", "SURVEY_READ", "SURVEY_SEND",
    "EMAIL_TEMPLATE_MANAGE", "EMAIL_SEND",
    "LOG_READ",
    "SETTINGS_READ", "SETTINGS_UPDATE",
    "ADMIN_PANEL_ACCESS",
  ]),

  AGENT: new Set([
    "TICKET_CREATE", "TICKET_READ", "TICKET_UPDATE", "TICKET_CLOSE", "TICKET_ASSIGN", "TICKET_REOPEN",
    "COMMENT_CREATE", "COMMENT_READ",
    "CUSTOMER_READ",
    "SURVEY_READ", "SURVEY_SEND",
    "EMAIL_SEND",
    "SETTINGS_READ",
  ]),

  BILLING: new Set([
    "BILLING_READ", "BILLING_MANAGE",
    "SETTINGS_READ",
  ]),

  READONLY: new Set([
    "TICKET_READ",
    "COMMENT_READ",
    "CUSTOMER_READ",
    "USER_READ",
    "BILLING_READ",
    "SURVEY_READ",
    "LOG_READ",
    "SETTINGS_READ",
  ]),

  INTEGRATION: new Set([
    "TICKET_CREATE", "TICKET_READ", "TICKET_UPDATE", "TICKET_CLOSE",
    "COMMENT_CREATE", "COMMENT_READ",
    "CUSTOMER_CREATE", "CUSTOMER_READ", "CUSTOMER_UPDATE",
  ]),

  CUSTOMER: new Set([
    "TICKET_CREATE", "TICKET_READ",
    "COMMENT_CREATE", "COMMENT_READ",
  ]),

  // ─── Platform Admin Roles ────────────────────────────

  SUPER_ADMIN: new Set([
    // Full platform access
    "ADMIN_TENANT_READ", "ADMIN_TENANT_UPDATE", "ADMIN_TENANT_SUSPEND", "ADMIN_TENANT_DELETE",
    "ADMIN_USER_READ", "ADMIN_USER_UPDATE", "ADMIN_USER_IMPERSONATE",
    "ADMIN_SUBSCRIPTION_READ", "ADMIN_SUBSCRIPTION_UPDATE", "ADMIN_SUBSCRIPTION_CANCEL",
    "ADMIN_TICKET_READ", "ADMIN_TICKET_ESCALATE",
    "ADMIN_CONTENT_READ", "ADMIN_CONTENT_UPDATE",
    "ADMIN_ANALYTICS_READ",
    "ADMIN_AUDIT_READ",
    "ADMIN_SETTINGS_READ", "ADMIN_SETTINGS_UPDATE",
    "ADMIN_ANNOUNCEMENT_CREATE",
    "ADMIN_PANEL_ACCESS",
  ]),

  MANAGER: new Set([
    // Tenant + user + subscription management, analytics, audit
    "ADMIN_TENANT_READ", "ADMIN_TENANT_UPDATE", "ADMIN_TENANT_SUSPEND",
    "ADMIN_USER_READ", "ADMIN_USER_UPDATE",
    "ADMIN_SUBSCRIPTION_READ", "ADMIN_SUBSCRIPTION_UPDATE",
    "ADMIN_TICKET_READ", "ADMIN_TICKET_ESCALATE",
    "ADMIN_ANALYTICS_READ",
    "ADMIN_AUDIT_READ",
    "ADMIN_SETTINGS_READ",
    "ADMIN_PANEL_ACCESS",
  ]),

  SALES: new Set([
    // Subscription and tenant onboarding focus
    "ADMIN_TENANT_READ",
    "ADMIN_USER_READ",
    "ADMIN_SUBSCRIPTION_READ", "ADMIN_SUBSCRIPTION_UPDATE",
    "ADMIN_ANALYTICS_READ",
    "ADMIN_PANEL_ACCESS",
  ]),

  CUSTOMER_CARE: new Set([
    // Cross-tenant ticket support and customer lookup
    "ADMIN_TENANT_READ",
    "ADMIN_USER_READ",
    "ADMIN_TICKET_READ", "ADMIN_TICKET_ESCALATE",
    "ADMIN_SUBSCRIPTION_READ",
    "ADMIN_PANEL_ACCESS",
  ]),

  SPECIAL: new Set([
    // Content management, announcements, policies
    "ADMIN_CONTENT_READ", "ADMIN_CONTENT_UPDATE",
    "ADMIN_ANNOUNCEMENT_CREATE",
    "ADMIN_ANALYTICS_READ",
    "ADMIN_AUDIT_READ",
    "ADMIN_PANEL_ACCESS",
  ]),
};

/**
 * Check if a set of user roles grants a specific permission.
 * Unions permissions from all assigned roles.
 */
export function hasPermission(userRoles: Role[], permission: Permission): boolean {
  return userRoles.some((role) => ROLE_PERMISSIONS[role]?.has(permission));
}

/**
 * Check if a set of user roles grants ALL of the specified permissions.
 */
export function hasAllPermissions(userRoles: Role[], permissions: Permission[]): boolean {
  return permissions.every((p) => hasPermission(userRoles, p));
}

/**
 * Get the union of all permissions for a set of roles.
 */
export function getPermissions(roles: Role[]): Set<Permission> {
  const perms = new Set<Permission>();
  for (const role of roles) {
    const rolePerms = ROLE_PERMISSIONS[role];
    if (rolePerms) {
      for (const p of rolePerms) perms.add(p);
    }
  }
  return perms;
}

/**
 * Validate that a string is a valid Role.
 */
export function isValidRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
