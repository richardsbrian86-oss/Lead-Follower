/**
 * Session / user fixtures for E2E tests that need a real signed-in user.
 *
 * After the Clerk migration there is no local sessions table — Clerk owns
 * sessions.  A "test session" is therefore established by:
 *   1. createTestUser(): create a real Clerk user (dev instance) via the
 *      Clerk Backend API with a known password.  No local DB row is created —
 *      the API server JIT-provisions one (gym_id = null) on the first
 *      authenticated request, exactly like a real new sign-up.
 *   2. signInWithPassword(page, ...): drive the actual Clerk <SignIn /> UI in
 *      the Playwright browser, which yields a genuine browser session.
 *   3. deleteTestUser(): remove the Clerk user and any local DB rows
 *      (user + gym) created during the test.
 */

import pg from "pg";
import crypto from "crypto";
import type { Page } from "@playwright/test";

const { Pool } = pg;

const CLERK_API = "https://api.clerk.com/v1";

function clerkHeaders(): Record<string, string> {
  const key = process.env.CLERK_SECRET_KEY;
  if (!key) throw new Error("CLERK_SECRET_KEY is required for E2E session fixtures");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export interface TestUser {
  clerkUserId: string;
  email: string;
  password: string;
}

/**
 * Create a real Clerk user (dev instance) with a known password.
 * Intentionally does NOT insert a local users row — the server's JIT
 * provisioning creates it with gym_id = null on first authenticated request,
 * which is exactly the new-owner onboarding state under test.
 */
export async function createTestUser(prefix = "e2e-onboard"): Promise<TestUser> {
  const uid = crypto.randomBytes(5).toString("hex");
  const email = `${prefix}-${uid}@example.com`;
  const password = `E2e!${crypto.randomBytes(12).toString("hex")}`;

  const res = await fetch(`${CLERK_API}/users`, {
    method: "POST",
    headers: clerkHeaders(),
    body: JSON.stringify({
      email_address: [email],
      password,
      skip_password_checks: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`createTestUser: Clerk API ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { id: string };
  return { clerkUserId: data.id, email, password };
}

/**
 * Delete the Clerk user and all local DB state (user row + any gym the test
 * created for them, including dependent rows).
 */
export async function deleteTestUser(user: TestUser): Promise<void> {
  // Clerk side — ignore 404 (already deleted)
  const res = await fetch(`${CLERK_API}/users/${user.clerkUserId}`, {
    method: "DELETE",
    headers: clerkHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    console.warn(`deleteTestUser: Clerk delete failed ${res.status}: ${await res.text()}`);
  }

  // Local DB side
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      "SELECT gym_id FROM users WHERE email = $1",
      [user.email.toLowerCase()],
    );
    const gymId = rows[0]?.gym_id;
    await pool.query("DELETE FROM users WHERE email = $1", [user.email.toLowerCase()]);
    if (gymId) {
      await pool.query("DELETE FROM invites WHERE gym_id = $1", [gymId]);
      await pool.query("DELETE FROM sequence_templates WHERE gym_id = $1", [gymId]);
      await pool.query("DELETE FROM gyms WHERE id = $1", [gymId]);
    }
  } finally {
    await pool.end();
  }
}

/** Read a user's gym_id (or null) straight from the DB. */
export async function getUserGymId(email: string): Promise<string | null> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      "SELECT gym_id FROM users WHERE email = $1",
      [email.toLowerCase()],
    );
    return (rows[0]?.gym_id as string | undefined) ?? null;
  } finally {
    await pool.end();
  }
}

/** Fetch a gym row by id. */
export async function getGymById(
  gymId: string,
): Promise<{ id: string; name: string } | null> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query("SELECT id, name FROM gyms WHERE id = $1", [gymId]);
    return rows[0] ?? null;
  } finally {
    await pool.end();
  }
}

/**
 * Establish a real Clerk browser session for the given test user.
 *
 * Password sign-in through the <SignIn /> UI is blocked in automation by
 * Clerk's new-device email verification ("client trust"), so we use the
 * official programmatic path instead: mint a sign-in token via the Backend
 * API and consume it in the browser with the ticket strategy.  This yields a
 * genuine session — subsequent /api/* requests carry real Clerk credentials.
 */
export async function signInAsUser(page: Page, user: TestUser): Promise<void> {
  const res = await fetch(`${CLERK_API}/sign_in_tokens`, {
    method: "POST",
    headers: clerkHeaders(),
    body: JSON.stringify({ user_id: user.clerkUserId, expires_in_seconds: 600 }),
  });
  if (!res.ok) {
    throw new Error(`signInAsUser: sign_in_tokens ${res.status}: ${await res.text()}`);
  }
  const { token } = (await res.json()) as { token: string };

  await page.goto("/");
  await page.waitForFunction(
    () => {
      const clerk = (window as unknown as { Clerk?: { loaded?: boolean } }).Clerk;
      return !!clerk?.loaded;
    },
    null,
    { timeout: 30_000 },
  );
  await page.evaluate(async (ticket) => {
    const clerk = (window as unknown as {
      Clerk: {
        client: {
          signIn: {
            create(p: { strategy: string; ticket: string }): Promise<{
              status: string;
              createdSessionId: string;
            }>;
          };
        };
        setActive(p: { session: string }): Promise<void>;
      };
    }).Clerk;
    const signIn = await clerk.client.signIn.create({ strategy: "ticket", ticket });
    if (signIn.status !== "complete") {
      throw new Error(`Ticket sign-in did not complete: ${signIn.status}`);
    }
    await clerk.setActive({ session: signIn.createdSessionId });
  }, token);

  // Wait until the app-side session is actually usable: /api/me returns 200
  // once the Clerk session is active (this also triggers JIT provisioning).
  await page.waitForResponse(
    (res2) => res2.url().includes("/api/me") && res2.status() === 200,
    { timeout: 30_000 },
  );
}
