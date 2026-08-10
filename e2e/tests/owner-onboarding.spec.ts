/**
 * E2E tests for new-owner onboarding (post-Clerk-migration).
 *
 * Flow under test:
 *   1. A brand-new user signs up/signs in via Clerk → JIT provisioning creates
 *      a local users row with gym_id = null.
 *   2. HomeRedirect sees gymId = null and renders GymSetupPage (not the
 *      dashboard).
 *   3. Submitting a gym name POSTs /api/gyms, which creates the gym, assigns
 *      it to the user (role=owner), and the UI transitions to the dashboard.
 *
 * Fixtures: a real Clerk dev-instance user is created via the Clerk Backend
 * API (see helpers/session.ts) and signed in through the actual Clerk UI, so
 * the whole path — Clerk session, JIT provisioning, gym creation — is
 * exercised end-to-end.
 */

import { test, expect } from "@playwright/test";
import {
  createTestUser,
  deleteTestUser,
  signInAsUser,
  getUserGymId,
  getGymById,
  type TestUser,
} from "../helpers/session.js";

test.describe("New owner onboarding", () => {
  test.describe.configure({ mode: "serial" });

  let user: TestUser;

  test.beforeAll(async () => {
    user = await createTestUser();
  });

  test.afterAll(async () => {
    if (user) await deleteTestUser(user);
  });

  test("user with no gym sees GymSetupPage, not the dashboard", async ({ page }) => {
    await signInAsUser(page, user);

    // GymSetupPage is shown
    await expect(page.getByRole("heading", { name: "Set up your gym" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.locator("#gymName")).toBeVisible();

    // The dashboard is NOT shown
    await expect(page.getByRole("heading", { name: /dashboard/i })).toHaveCount(0);

    // JIT provisioning created the local row with gym_id = null
    expect(await getUserGymId(user.email)).toBeNull();
  });

  test("submitting a gym name calls POST /api/gyms, creates the gym, and shows the dashboard", async ({
    page,
  }) => {
    await signInAsUser(page, user);
    await expect(page.getByRole("heading", { name: "Set up your gym" })).toBeVisible({
      timeout: 20_000,
    });

    const gymName = `E2E Onboarding Gym ${Date.now()}`;
    await page.locator("#gymName").fill(gymName);

    const [gymsResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/gyms") && res.request().method() === "POST",
      ),
      page.getByRole("button", { name: /create gym/i }).click(),
    ]);
    expect(gymsResponse.status()).toBe(201);
    const body = (await gymsResponse.json()) as { gym: { id: string; name: string } };
    expect(body.gym.name).toBe(gymName);

    // UI transitions to the authenticated app (dashboard), setup form is gone
    await expect(page.getByRole("heading", { name: "Set up your gym" })).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(page.getByText("Today's Actions")).toBeVisible({ timeout: 20_000 });

    // DB state: gym exists and is assigned to the user
    const gymId = await getUserGymId(user.email);
    expect(gymId).toBe(body.gym.id);
    const gym = await getGymById(body.gym.id);
    expect(gym?.name).toBe(gymName);
  });
});
