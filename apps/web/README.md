# TRES CRM Web

Next.js 15 frontend with React 19, Tailwind CSS 4, TanStack Query, and Zustand.

## Structure
```
src/app/
  (public)/     Landing, pricing, signup, docs
  (console)/    Dashboard, tickets, customers, settings
  (admin)/      Tenant management, policies, content
```

## Running
```bash
pnpm dev:web    # http://localhost:3000
pnpm build:web  # Production build
```

## Key Dependencies
- TanStack React Query for server state
- Zustand for client state
- React Hook Form + Zod for forms
- TipTap for rich text editing
- Axios for HTTP client
