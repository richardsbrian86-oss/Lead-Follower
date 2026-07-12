/**
 * E2E tests for login gate, session handling, and logout.
 *
 * These tests verify the full browser-level auth flow:
 *   1. Unauthenticated users see the login gate (not the dashboard).
 *   2. A valid session cookie gives access to the dashboard and protected API routes.
 *   3. Calling the logout endpoint clears the session and returns the login gate.
 *
 * Authentication is tested via direct session injection (DB insert + cookie) rather
 * than a live OIDC redirect, which requires a real Replit identity.  The full
 * browser-driven OIDC flow is validated separately by the Playwright testing skill
 * (`runTest({ testReplitAuth: true })`), which provides an OIDC mock bypass.
 */

import { test, expect, type BrowserContext } from "@playwright/test";
import { createTestSession, deleteTestSession, sessionExists } from "../helpers/session.js";

const DOMAIN = process.env.REPLIT_DEV_DOMAIN;
const COOKIE_DOMAIN = DOMAIN ?? "localhost";

const TEST_USER = {
  id: "e2e-auth-gate-user-001",
  email: "auth-gate-test@example.com",
  firstName: "Auth",
  lastName: "Tester",
};

async function setSessionCookie(context: BrowserContext, sid: string) {
  await context.addCookies([
    {
      name: "sid",
      value: sid,
      domain: COOKIE_DOMAIN,
      path: "/",
      httpOnly: true,
      secure: !!DOMAIN,
      sameSite: "Lax",
    },
  ]);
}

test.describe("Login gate — unauthenticated", () => {
  test("shows login gate with welcome heading and sign-in button when no session exists", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Sign in" }),
    ).toBeVisible();

    await expect(page.getByText("Leads Pipeline")).not.toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" })).not.toBeVisible();
  });

  test("unauthenticated requests to protected API routes return 401", async ({
    request,
  }) => {
    const resp = await request.get("/api/leads?page=1&limit=5");
    expect(resp.status()).toBe(401);

    const body = await resp.json();
    expect(body).toHaveProperty("error");
  });

  test("GET /api/auth/user returns null user when unauthenticated", async ({
    request,
  }) => {
    const resp = await request.get("/api/auth/user");
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.user).toBeNull();
  });
});

test.describe("Session auth — authenticated via injected session", () => {
  let sid: string;

  test.beforeEach(async () => {
    sid = await createTestSession(TEST_USER);
  });

  test.afterEach(async () => {
    await deleteTestSession(sid).catch(() => {});
  });

  test("valid session cookie grants access to the dashboard", async ({
    page,
    context,
  }) => {
    await setSessionCookie(context, sid);
    await page.goto("/");

    await expect(page.getByText("Leads Pipeline")).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Sign in" }),
    ).not.toBeVisible();
  });

  test("valid session cookie allows protected API calls to succeed", async ({
    context,
  }) => {
    await context.addCookies([
      {
        name: "sid",
        value: sid,
        domain: COOKIE_DOMAIN,
        path: "/",
        httpOnly: true,
        secure: !!DOMAIN,
        sameSite: "Lax",
      },
    ]);

    const authResp = await context.request.get("/api/auth/user");
    expect(authResp.status()).toBe(200);
    const authBody = await authResp.json();
    expect(authBody.user).not.toBeNull();
    expect(authBody.user.id).toBe(TEST_USER.id);

    const leadsResp = await context.request.get("/api/leads?page=1&limit=5");
    expect(leadsResp.status()).toBe(200);
  });

  test("user display name appears in sidebar after session is set", async ({
    page,
    context,
  }) => {
    await setSessionCookie(context, sid);
    await page.goto("/");

    await expect(page.getByText("Auth Tester")).toBeVisible();
  });
});

test.describe("Logout — session cleared", () => {
  let sid: string;

  test.beforeEach(async () => {
    sid = await createTestSession(TEST_USER);
  });

  test("GET /api/logout clears the session from the database", async ({
    context,
  }) => {
    await context.addCookies([
      {
        name: "sid",
        value: sid,
        domain: COOKIE_DOMAIN,
        path: "/",
        httpOnly: true,
        secure: !!DOMAIN,
        sameSite: "Lax",
      },
    ]);

    const sessionBeforeLogout = await sessionExists(sid);
    expect(sessionBeforeLogout).toBe(true);

    const response = await context.request.get("/api/logout");

    expect(response.status()).toBe(200);

    const sessionAfterLogout = await sessionExists(sid);
    expect(sessionAfterLogout).toBe(false);
  });

  test("after logout, navigating to / shows the login gate again", async ({
    page,
    context,
  }) => {
    await setSessionCookie(context, sid);
    await page.goto("/");

    await expect(page.getByText("Leads Pipeline")).toBeVisible();

    await context.request.get("/api/logout");

    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sign in" }),
    ).toBeVisible();
    await expect(page.getByText("Leads Pipeline")).not.toBeVisible();
  });

  test("after logout, the protected API returns 401", async ({
    context,
  }) => {
    await context.addCookies([
      {
        name: "sid",
        value: sid,
        domain: COOKIE_DOMAIN,
        path: "/",
        httpOnly: true,
        secure: !!DOMAIN,
        sameSite: "Lax",
      },
    ]);

    const beforeLogout = await context.request.get("/api/leads?page=1&limit=5");
    expect(beforeLogout.status()).toBe(200);

    await context.request.get("/api/logout");

    await context.clearCookies();

    const afterLogout = await context.request.get("/api/leads?page=1&limit=5");
    expect(afterLogout.status()).toBe(401);
  });
});
