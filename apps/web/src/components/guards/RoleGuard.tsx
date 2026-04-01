'use client';

import { useAuthStore, type Role } from '@/stores/authStore';

const HIERARCHY: Role[] = ['READONLY', 'AGENT', 'ADMIN', 'OWNER'];
const ADMIN_HIERARCHY: Role[] = ['CUSTOMER_CARE', 'SALES', 'MANAGER', 'SUPER_ADMIN'];
const LATERALS = new Set<Role>(['BILLING', 'INTEGRATION', 'CUSTOMER', 'SPECIAL']);

function meetsRole(userRoles: Role[], required: Role): boolean {
  // Lateral roles require exact match
  if (LATERALS.has(required)) return userRoles.includes(required);
  // Check tenant hierarchy
  const reqIdx = HIERARCHY.indexOf(required);
  if (reqIdx !== -1) {
    return userRoles.some(r => {
      const idx = HIERARCHY.indexOf(r);
      return idx !== -1 && idx >= reqIdx;
    });
  }
  // Check admin hierarchy
  const adminReqIdx = ADMIN_HIERARCHY.indexOf(required);
  if (adminReqIdx !== -1) {
    return userRoles.some(r => {
      const idx = ADMIN_HIERARCHY.indexOf(r);
      return idx !== -1 && idx >= adminReqIdx;
    });
  }
  return false;
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
