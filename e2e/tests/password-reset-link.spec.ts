/**
 * E2E tests for stale password-reset links (/?token=...).
 *
 * Clerk owns password reset after the auth migration, so the legacy
 * "Set new password" form no longer exists.  Old reset emails may still
 * contain links of the form /?token=<reset-token>; HomeRedirect strips the
 * stale ?token param via history.replaceState once auth state loads —
 * unconditionally, for BOTH signed-in and signed-out users — so an
 * already-authenticated user opening an old reset email lands on the app
 * root and never sees a reset-password form.
 *
 * NOTE: A real signed-in Clerk browser session is not possible in the Replit
 * dev environment (dev FAPI cross-origin restriction — see invite-flows
 * spec).  Because the ?token strip is deliberately unconditional on auth
 * state, exercising it signed-out covers the exact same code path a
 * signed-in user hits; the signed-in branch additionally renders AuthedApp
 * instead of the landing page, which is covered by unit-level rendering
 * logic (Show when="signed-in").
 */

import { test, expect } from "@playwright/test";
import crypto from "crypto";

test.describe("Stale password reset link (/?token=...)", () => {
  test("visiting /?token=<reset-token> strips the token param and never shows a reset form", async ({
    page,
  }) => {
    const staleToken = crypto.randomBytes(32).toString("hex");
    await page.goto(`/?token=${staleToken}`);

    // Landing page renders (signed-out) — no reset-password UI anywhere.
    await expect(
      page.getByRole("heading", { name: "Flow State" }),
    ).toBeVisible();
    await expect(page.getByText(/set new password/i)).toHaveCount(0);
    await expect(page.getByText(/reset password/i)).toHaveCount(0);

    // The stale ?token param is stripped from the URL via replaceState.
    await expect
      .poll(() => page.evaluate(() => window.location.search))
      .not.toContain("token=");
  });

  test("token param is stripped while other query params are preserved", async ({
    page,
  }) => {
    await page.goto(`/?token=${crypto.randomBytes(16).toString("hex")}&verified=true`);

    // Signed-out: ?verified=true must survive (its banner is for signed-out
    // users), but ?token must be removed.
    await expect(page.getByTestId("verified-success")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.location.search))
      .not.toContain("token=");
    expect(await page.evaluate(() => window.location.search)).toContain(
      "verified=true",
    );
  });
});
