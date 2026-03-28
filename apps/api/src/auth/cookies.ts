import { Response } from 'express';
import { ENV } from '../config/env';

const SECURE = ENV.COOKIE_SECURE;
const DOMAIN = ENV.COOKIE_DOMAIN;
const SAME_SITE = ENV.COOKIE_SAMESITE;

export function setAuthCookies(res: Response, args: {
  accessToken: string;
  refreshToken: string;
  role: 'ADMIN'|'OWNER'|'AGENT'|'BILLING'|'SUPER'|'SPECIAL'|'READONLY'|'INTEGRATION';
}) {
  res.cookie('tc_session', args.accessToken, {
    httpOnly: true,
    secure: SECURE,
    sameSite: SAME_SITE,
    domain: DOMAIN,
    path: '/',
    maxAge: ENV.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie('tc_refresh', args.refreshToken, {
    httpOnly: true,
    secure: SECURE,
    sameSite: SAME_SITE,
    domain: DOMAIN,
    path: '/',
    maxAge: ENV.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
  // Non-HttpOnly role cookie for Next middleware RBAC
  res.cookie('tc_role', args.role, {
    httpOnly: false,
    secure: SECURE,
    sameSite: SAME_SITE,
    domain: DOMAIN,
    path: '/',
    maxAge: ENV.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  ['tc_session','tc_refresh','tc_role'].forEach(name => {
    res.clearCookie(name, { 
      path:'/', 
      secure: SECURE, 
      sameSite: SAME_SITE, 
      domain: DOMAIN }
    );
  });
}
