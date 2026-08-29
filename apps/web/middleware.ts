import { NextRequest, NextResponse } from 'next/server';

const VALID_ROLES = new Set([
  'OWNER', 'ADMIN', 'AGENT', 'BILLING', 'READONLY', 'INTEGRATION', 'CUSTOMER',
  'SUPER_ADMIN', 'MANAGER', 'SALES', 'CUSTOMER_CARE', 'SPECIAL',
]);
const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'MANAGER', 'SALES', 'CUSTOMER_CARE', 'SPECIAL']);
const ADMIN_ROUTES = [/^\/(admin)(\/|$)/];
const CONSOLE_ROUTES = [/^\/(console|dashboard|tickets|customers|staff|billing|settings|reports)(\/|$)/];
const PORTAL_ROUTES = [/^\/(portal)(\/|$)/];

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const role = req.cookies.get('tc_role')?.value;
  const hasValidRole = !!role && VALID_ROLES.has(role);

  const matches = (patterns: RegExp[]) => patterns.some(p => p.test(path));

  // Subdomain routing: if request comes on a subdomain (e.g., acme.trescrm.com),
  // rewrite to portal routes with tenant context
  const host = req.headers.get('host') || '';
  const mainDomains = ['localhost', 'trescrm.com', 'tres-crm.com'];
  const isSubdomain = !mainDomains.some(d => host === d || host.startsWith(d + ':'))
    && host.includes('.');
  if (isSubdomain && !path.startsWith('/portal') && !path.startsWith('/_next') && !path.startsWith('/api')) {
    // Extract subdomain and rewrite to /portal with subdomain header
    const subdomain = host.split('.')[0];
    const url = req.nextUrl.clone();
    url.pathname = '/portal' + path;
    const response = NextResponse.rewrite(url);
    response.headers.set('x-tenant-subdomain', subdomain);
    return response;
  }

  // Portal routes are public — no role check needed (token-based auth handled by API)
  if (matches(PORTAL_ROUTES)) {
    return NextResponse.next();
  }

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
