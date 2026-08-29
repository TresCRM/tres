import type { BrowserContext, APIRequestContext } from "@playwright/test";
import { request as playwrightRequest } from "@playwright/test";
import { readStack, totpFor, type SeededTenant, type SeedRole } from "./stack";

/**
 * Sign a seeded user in against the real API and transplant the resulting
 * session into a browser context.
 *
 * Signing in over HTTP rather than driving the login form keeps every spec that
 * merely *needs* a session from re-testing login; auth.spec.ts exercises the
 * form itself. The API and the web app are served from the same host on
 * different ports, and cookies ignore the port, so the session the API issues is
 * sent to the web origin as well.
 */

export interface Session {
  accessToken?: string;
  cookies: Array<{ name: string; value: string }>;
}

/**
 * Complete a login, including the MFA challenge when the account has it
 * enabled. OWNER and ADMIN always do — see the note in stack.ts.
 */
export async function apiSignIn(
  api: APIRequestContext,
  tenant: SeededTenant,
  role: SeedRole
): Promise<Session> {
  const user = tenant.users[role];

  const res = await api.post("/api/v1/auth/login", {
    data: { email: user.email, password: user.password, tenantSlug: tenant.slug },
  });
  if (!res.ok()) {
    throw new Error(`login failed for ${role}: ${res.status()} ${await res.text()}`);
  }

  let body = await res.json();

  if (body.mfaRequired) {
    if (!user.mfaSecret) {
      throw new Error(`${role} was challenged for MFA but has no seeded secret`);
    }
    const verify = await api.post("/api/v1/auth/mfa-verify", {
      data: { mfaTicket: body.mfaTicket, code: await totpFor(user.mfaSecret) },
    });
    if (!verify.ok()) {
      throw new Error(`mfa-verify failed for ${role}: ${verify.status()} ${await verify.text()}`);
    }
    body = await verify.json();
  }

  const state = await api.storageState();
  return {
    accessToken: body.accessToken ?? body.token,
    cookies: state.cookies.map((c) => ({ name: c.name, value: c.value })),
  };
}

/** An API request context bound to the running API, with cookie storage. */
export async function apiContext(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({ baseURL: readStack().apiUrl });
}

/**
 * Put a signed-in session into the browser.
 *
 * The web middleware gates the console on a tc_role cookie, so the cookies the
 * API set are copied onto the web origin. Cookies are host-scoped and both
 * servers run on 127.0.0.1, so this reflects how the pair actually behaves
 * rather than faking anything.
 */
export async function applySession(
  context: BrowserContext,
  session: Session,
  webOrigin: string
): Promise<void> {
  const url = new URL(webOrigin);
  await context.addCookies(
    session.cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: url.hostname,
      path: "/",
    }))
  );
}

/** Seed-free convenience: sign in and hand back a browser context ready to use. */
export async function signInAs(
  context: BrowserContext,
  tenant: SeededTenant,
  role: SeedRole,
  webOrigin: string
): Promise<Session> {
  const api = await apiContext();
  try {
    const session = await apiSignIn(api, tenant, role);
    await applySession(context, session, webOrigin);
    return session;
  } finally {
    await api.dispose();
  }
}
