'use client';

import { useState } from 'react';
import { ShieldCheck, Users, Lock, ChevronDown, ChevronRight } from 'lucide-react';

// ─── Role definitions (mirrors packages/types/src/roles.ts) ──────────

const TENANT_ROLES = [
  { role: 'OWNER', label: 'Account Owner', desc: 'Full tenant access including ownership transfer and billing management' },
  { role: 'ADMIN', label: 'Administrator', desc: 'Full tenant access except ownership transfer and billing management' },
  { role: 'AGENT', label: 'Support Agent', desc: 'Ticket management, customer read access, survey and email sending' },
  { role: 'BILLING', label: 'Billing Manager', desc: 'Billing read/manage and settings read (lateral role)' },
  { role: 'READONLY', label: 'Read Only', desc: 'Read access to all resources, no write permissions' },
  { role: 'INTEGRATION', label: 'API Integration', desc: 'Ticket and customer CRUD for external integrations (lateral role)' },
  { role: 'CUSTOMER', label: 'Customer', desc: 'Create/read own tickets and comments only' },
];

const ADMIN_ROLES = [
  { role: 'SUPER_ADMIN', label: 'Super Administrator', desc: 'Full platform access — all admin permissions' },
  { role: 'MANAGER', label: 'Platform Manager', desc: 'Tenant/user/subscription management, analytics, audit, settings read' },
  { role: 'SALES', label: 'Sales Representative', desc: 'Subscription and tenant onboarding, analytics' },
  { role: 'CUSTOMER_CARE', label: 'Customer Care Agent', desc: 'Cross-tenant ticket support, customer and subscription lookup' },
  { role: 'SPECIAL', label: 'Special Operations', desc: 'Content management, announcements, analytics, audit (lateral role)' },
];

const TENANT_HIERARCHY = ['READONLY', 'AGENT', 'ADMIN', 'OWNER'];
const ADMIN_HIERARCHY = ['CUSTOMER_CARE', 'SALES', 'MANAGER', 'SUPER_ADMIN'];

// ─── Permission matrix ───────────────────────────────────────────────

const TENANT_PERMISSIONS: Record<string, string[]> = {
  OWNER: [
    'TICKET_CREATE', 'TICKET_READ', 'TICKET_UPDATE', 'TICKET_CLOSE', 'TICKET_ASSIGN', 'TICKET_REOPEN',
    'COMMENT_CREATE', 'COMMENT_READ', 'CUSTOMER_CREATE', 'CUSTOMER_READ', 'CUSTOMER_UPDATE',
    'USER_INVITE', 'USER_READ', 'USER_UPDATE', 'USER_DISABLE',
    'BILLING_READ', 'BILLING_MANAGE', 'SURVEY_CREATE', 'SURVEY_READ', 'SURVEY_SEND',
    'EMAIL_TEMPLATE_MANAGE', 'EMAIL_SEND', 'LOG_READ', 'SETTINGS_READ', 'SETTINGS_UPDATE',
    'ADMIN_PANEL_ACCESS', 'OWNERSHIP_TRANSFER',
  ],
  ADMIN: [
    'TICKET_CREATE', 'TICKET_READ', 'TICKET_UPDATE', 'TICKET_CLOSE', 'TICKET_ASSIGN', 'TICKET_REOPEN',
    'COMMENT_CREATE', 'COMMENT_READ', 'CUSTOMER_CREATE', 'CUSTOMER_READ', 'CUSTOMER_UPDATE',
    'USER_INVITE', 'USER_READ', 'USER_UPDATE', 'USER_DISABLE', 'BILLING_READ',
    'SURVEY_CREATE', 'SURVEY_READ', 'SURVEY_SEND', 'EMAIL_TEMPLATE_MANAGE', 'EMAIL_SEND',
    'LOG_READ', 'SETTINGS_READ', 'SETTINGS_UPDATE', 'ADMIN_PANEL_ACCESS',
  ],
  AGENT: [
    'TICKET_CREATE', 'TICKET_READ', 'TICKET_UPDATE', 'TICKET_CLOSE', 'TICKET_ASSIGN', 'TICKET_REOPEN',
    'COMMENT_CREATE', 'COMMENT_READ', 'CUSTOMER_READ', 'SURVEY_READ', 'SURVEY_SEND',
    'EMAIL_SEND', 'SETTINGS_READ',
  ],
  BILLING: ['BILLING_READ', 'BILLING_MANAGE', 'SETTINGS_READ'],
  READONLY: [
    'TICKET_READ', 'COMMENT_READ', 'CUSTOMER_READ', 'USER_READ', 'BILLING_READ',
    'SURVEY_READ', 'LOG_READ', 'SETTINGS_READ',
  ],
  INTEGRATION: [
    'TICKET_CREATE', 'TICKET_READ', 'TICKET_UPDATE', 'TICKET_CLOSE',
    'COMMENT_CREATE', 'COMMENT_READ', 'CUSTOMER_CREATE', 'CUSTOMER_READ', 'CUSTOMER_UPDATE',
  ],
  CUSTOMER: ['TICKET_CREATE', 'TICKET_READ', 'COMMENT_CREATE', 'COMMENT_READ'],
};

const ADMIN_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: [
    'ADMIN_TENANT_READ', 'ADMIN_TENANT_UPDATE', 'ADMIN_TENANT_SUSPEND',
    'ADMIN_USER_READ', 'ADMIN_USER_UPDATE', 'ADMIN_USER_IMPERSONATE',
    'ADMIN_SUBSCRIPTION_READ', 'ADMIN_SUBSCRIPTION_UPDATE', 'ADMIN_SUBSCRIPTION_CANCEL',
    'ADMIN_TICKET_READ', 'ADMIN_TICKET_ESCALATE',
    'ADMIN_CONTENT_READ', 'ADMIN_CONTENT_UPDATE',
    'ADMIN_ANALYTICS_READ', 'ADMIN_AUDIT_READ',
    'ADMIN_SETTINGS_READ', 'ADMIN_SETTINGS_UPDATE',
    'ADMIN_ANNOUNCEMENT_CREATE', 'ADMIN_PANEL_ACCESS',
  ],
  MANAGER: [
    'ADMIN_TENANT_READ', 'ADMIN_TENANT_UPDATE', 'ADMIN_TENANT_SUSPEND',
    'ADMIN_USER_READ', 'ADMIN_USER_UPDATE',
    'ADMIN_SUBSCRIPTION_READ', 'ADMIN_SUBSCRIPTION_UPDATE',
    'ADMIN_TICKET_READ', 'ADMIN_TICKET_ESCALATE',
    'ADMIN_ANALYTICS_READ', 'ADMIN_AUDIT_READ', 'ADMIN_SETTINGS_READ', 'ADMIN_PANEL_ACCESS',
  ],
  SALES: [
    'ADMIN_TENANT_READ', 'ADMIN_USER_READ',
    'ADMIN_SUBSCRIPTION_READ', 'ADMIN_SUBSCRIPTION_UPDATE',
    'ADMIN_ANALYTICS_READ', 'ADMIN_PANEL_ACCESS',
  ],
  CUSTOMER_CARE: [
    'ADMIN_TENANT_READ', 'ADMIN_USER_READ',
    'ADMIN_TICKET_READ', 'ADMIN_TICKET_ESCALATE',
    'ADMIN_SUBSCRIPTION_READ', 'ADMIN_PANEL_ACCESS',
  ],
  SPECIAL: [
    'ADMIN_CONTENT_READ', 'ADMIN_CONTENT_UPDATE',
    'ADMIN_ANNOUNCEMENT_CREATE', 'ADMIN_ANALYTICS_READ',
    'ADMIN_AUDIT_READ', 'ADMIN_PANEL_ACCESS',
  ],
};

function RoleCard({ role, label, desc, permissions, hierarchyPos }: {
  role: string; label: string; desc: string; permissions: string[]; hierarchyPos?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left min-h-[56px]"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3 min-w-0">
          <ShieldCheck size={18} className="text-gray-400 shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{label}</span>
              <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">{role}</code>
              {hierarchyPos && <span className="text-xs text-gray-400">{hierarchyPos}</span>}
            </div>
            <p className="text-xs text-gray-500 truncate">{desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-gray-400">{permissions.length} perms</span>
          {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t">
          <div className="flex flex-wrap gap-1.5 pt-3">
            {permissions.map(p => (
              <code key={p} className="text-xs bg-gray-50 border px-2 py-1 rounded font-mono">{p}</code>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminRolesPage() {
  const [tab, setTab] = useState<'tenant' | 'admin'>('admin');

  const roles = tab === 'admin' ? ADMIN_ROLES : TENANT_ROLES;
  const permissions = tab === 'admin' ? ADMIN_PERMISSIONS : TENANT_PERMISSIONS;
  const hierarchy = tab === 'admin' ? ADMIN_HIERARCHY : TENANT_HIERARCHY;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Roles & Permissions</h1>
        <p className="text-sm text-gray-500 mt-1">View the role hierarchy and permission matrix. Roles are code-defined in <code className="bg-gray-100 px-1 rounded text-xs">packages/types/src/roles.ts</code>.</p>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab('admin')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors min-h-[40px] ${tab === 'admin' ? 'bg-white shadow text-red-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Lock size={14} className="inline mr-1.5" />Admin Roles
        </button>
        <button
          onClick={() => setTab('tenant')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors min-h-[40px] ${tab === 'tenant' ? 'bg-white shadow text-red-600' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Users size={14} className="inline mr-1.5" />Tenant Roles
        </button>
      </div>

      {/* Hierarchy */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-600 mb-3">{tab === 'admin' ? 'Admin' : 'Tenant'} Role Hierarchy</h2>
        <div className="flex items-center gap-2 flex-wrap">
          {hierarchy.map((r, i) => (
            <div key={r} className="flex items-center gap-2">
              <code className="text-xs bg-gray-50 border px-2 py-1 rounded font-mono font-medium">{r}</code>
              {i < hierarchy.length - 1 && <span className="text-gray-300">&rarr;</span>}
            </div>
          ))}
          <span className="text-xs text-gray-400 ml-2">(higher privilege &rarr;)</span>
        </div>
        <p className="text-xs text-gray-400 mt-2">A user with a higher role automatically satisfies checks for lower roles. Lateral roles (BILLING, INTEGRATION, CUSTOMER, SPECIAL) require exact match.</p>
      </div>

      {/* Role Cards */}
      <div className="space-y-3">
        {roles.map(r => (
          <RoleCard
            key={r.role}
            role={r.role}
            label={r.label}
            desc={r.desc}
            permissions={permissions[r.role] || []}
            hierarchyPos={hierarchy.includes(r.role) ? `Level ${hierarchy.indexOf(r.role) + 1}` : 'Lateral'}
          />
        ))}
      </div>
    </div>
  );
}
