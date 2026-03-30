'use client';

import { useAuthStore, type Role } from '@/stores/authStore';

const HIERARCHY: Role[] = ['READONLY', 'AGENT', 'ADMIN', 'OWNER'];

function meetsRole(userRoles: Role[], required: Role): boolean {
  // Lateral roles (BILLING, INTEGRATION, CUSTOMER) require exact match
  const laterals = new Set<Role>(['BILLING', 'INTEGRATION', 'CUSTOMER']);
  if (laterals.has(required)) return userRoles.includes(required);
  // Hierarchical check
  const reqIdx = HIERARCHY.indexOf(required);
  if (reqIdx === -1) return false;
  return userRoles.some(r => {
    const idx = HIERARCHY.indexOf(r);
    return idx !== -1 && idx >= reqIdx;
  });
}

interface RoleGuardProps {
  roles: Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function RoleGuard({ roles, children, fallback }: RoleGuardProps) {
  const { user } = useAuthStore();
  if (!user) return null;

  const hasAccess = roles.some(r => meetsRole(user.roles, r));

  if (!hasAccess) {
    return fallback ?? (
      <div className="flex items-center justify-center min-h-[200px] text-gray-500" role="alert">
        <p>You do not have permission to access this section.</p>
      </div>
    );
  }

  return <>{children}</>;
}
