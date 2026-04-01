import { NextRequest, NextResponse } from 'next/server';

const VALID_ROLES = new Set([
  'OWNER', 'ADMIN', 'AGENT', 'BILLING', 'READONLY', 'INTEGRATION', 'CUSTOMER',
  'SUPER_ADMIN', 'MANAGER', 'SALES', 'CUSTOMER_CARE', 'SPECIAL',
]);
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'MANAGER', 'SALES', 'CUSTOMER_CARE', 'SPECIAL']);
const TENANT_ADMIN_ROLES = new Set(['ADMIN', 'OWNER']);
const ADMIN_ROUTES = [/^\/(admin)(\/|$)/];
const CONSOLE_ROUTES = [/^\/(console|dashboard|tickets|customers|staff|billing|settings|reports)(\/|$)/];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const role = req.cookies.get('tc_role')?.value;
  const hasValidRole = !!role && VALID_ROLES.has(role);

  const matches = (patterns: RegExp[]) => patterns.some(p => p.test(path));

  if (matches(ADMIN_ROUTES)) {
    if (!role || !ADMIN_ROLES.has(role)) {
      return NextResponse.redirect(new URL('/?m=forbidden', req.url));
    }
  }
  if (matches(CONSOLE_ROUTES)) {
    if (!hasValidRole) {
      return NextResponse.redirect(new URL('/?m=signin', req.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
};
