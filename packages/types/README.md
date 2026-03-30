# @tres-crm/types

Shared TypeScript types for roles, permissions, and event schemas used across API, web, and workers.

## Exports

### `roles.ts`
- `Role` type: `"OWNER" | "ADMIN" | "AGENT" | "BILLING" | "READONLY" | "INTEGRATION" | "CUSTOMER"`
- `Permission` type: 22 granular permissions
- `ROLE_PERMISSIONS`: Role-to-permission mapping
- `hasRole(userRoles, requiredRole)`: Hierarchy-aware role check
- `hasPermission(userRoles, permission)`: Permission check
- `isValidRole(value)`: Type guard

### `events.ts`
- `TicketCreated`, `TicketReplied`, `PresenceChanged` Zod schemas
