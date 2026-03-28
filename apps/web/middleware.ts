import { NextRequest, NextResponse } from 'next/server';

const ADMIN_ROUTES = [/^\/(admin)(\/|$)/];
const CONSOLE_ROUTES = [/^\/(console|dashboard|tickets|customers|staff|billing|settings)(\/|$)/];

export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const path = url.pathname;

  const role = req.cookies.get('tc_role')?.value as ('ADMIN'|'OWNER'|'AGENT'|undefined);

  const matches = (patterns: RegExp[]) => patterns.some(p => p.test(path));

  if (matches(ADMIN_ROUTES)) {
    if (role !== 'ADMIN') return NextResponse.redirect(new URL('/?m=forbidden', req.url));
  }
  if (matches(CONSOLE_ROUTES)) {
    if (!role) return NextResponse.redirect(new URL('/?m=signin', req.url));
  }
  return NextResponse.next();
}