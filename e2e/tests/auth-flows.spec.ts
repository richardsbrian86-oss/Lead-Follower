/**
 * E2E tests for auth flows that survive after the Clerk migration.
 *
 * Clerk now owns registration, login, forgot/reset password, and logout.
 * The browser-level login gate, session auth, and logout are covered in
 * auth-gate.spec.ts using session injection.
 *
 * What remains here:
 *   - The email-verification endpoint (/api/auth/verify-email) — still owned
 *     by our API and used for staff invite acceptance after Clerk sign-up.
 *   - The verified-success banner UI (/?verified=true) — unauthenticated
 *     landing-page behaviour checked via direct navigation.
 */

import { test, expect } from "@playwright/test";
import crypto from "crypto";
import {
  insertUnverifiedUserWithToken,
  deleteTestUserByEmail,
} from "../helpers/auth.js";

function uid(): string {
  return crypto.randomBytes(4).toString("hex");
}

// ---------------------------------------------------------------------------
// Email verification flow
// ---------------------------------------------------------------------------

test.describe("Email verification flow", () => {
  test("valid token — account activated and landing page shows success banner", async ({
    page,
  }) => {
    const email = `verify-ok-${uid()}@test.example`;
    const token = crypto.randomBytes(32).toString("hex");
    await insertUnverifiedUserWithToken(email, token);

    try {
      // Navigate to the verify-email API endpoint (as a real user would via email link)
      await page.goto(`/api/auth/verify-email?token=${token}`);

      // Should redirect to the frontend landing page with ?verified=true
      await expect(page).toHaveURL(/verified=true/);

      // Success banner should be visible on the landing page
      await expect(page.getByTestId("verified-success")).toBeVisible();
      await expect(page.getByText(/email verified/i)).toBeVisible();
    } finally {
      await deleteTestUserByEmail(email);
    }
  });

  test("invalid token — redirects to landing page with invalid banner", async ({
    page,
  }) => {
    await page.goto(
      "/api/auth/verify-email?token=definitely-not-a-real-token-xyz",
    );

    // Should redirect to the frontend landing page with ?verified=invalid
    await expect(page).toHaveURL(/verified=invalid/);

    await expect(page.getByTestId("verified-invalid")).toBeVisible();
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
  });

  test("expired token — redirects with invalid status", async ({ page }) => {
    const email = `verify-exp-${uid()}@test.example`;
    const token = crypto.randomBytes(32).toString("hex");
    // expiresInMs = -1000 means the token is already in the past
    await insertUnverifiedUserWithToken(email, token, -1000);

    try {
      await page.goto(`/api/auth/verify-email?token=${token}`);

      await expect(page).toHaveURL(/verified=invalid/);

      await expect(page.getByTestId("verified-invalid")).toBeVisible();
    } finally {
      await deleteTestUserByEmail(email);
    }
  });

  test("missing token — redirects with invalid status", async ({ page }) => {
    await page.goto("/api/auth/verify-email");

    await expect(page).toHaveURL(/verified=invalid/);

    await expect(page.getByTestId("verified-invalid")).toBeVisible();
  });

  test("verified banner shows 'Sign in now' button that navigates to sign-in", async ({
    page,
  }) => {
    // Navigate directly to the landing page with ?verified=true to test the banner UI
    await page.goto("/?verified=true");

    // The success banner should be visible
    await expect(page.getByTestId("verified-success")).toBeVisible();

    // The "Sign in now" button should be present inside the banner
    const signInNowBtn = page.getByTestId("sign-in-now");
    await expect(signInNowBtn).toBeVisible();
    await expect(signInNowBtn).toHaveText("Sign in now →");

    // Clicking it should navigate to the /sign-in route and render the Clerk SignIn component
    await signInNowBtn.click();
    await expect(page).toHaveURL(/sign-in/);
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  });

  test("pressing back after 'Sign in now' does not re-show the verified banner", async ({
    page,
  }) => {
    // Navigate to the verified landing page (as the email link would deliver)
    await page.goto("/?verified=true");
    await expect(page.getByTestId("verified-success")).toBeVisible();

    // Click "Sign in now →" — this should replace the ?verified=true history entry
    // with the bare "/" so pressing Back does not return to the banner URL.
    await page.getByTestId("sign-in-now").click();
    await expect(page).toHaveURL(/sign-in/);

    // Simulate the user pressing the browser back button
    await page.goBack();

    // We should be back on the landing page but WITHOUT the ?verified=true param.
    // The replaceState call in the click handler swapped /?verified=true → /
    // in the history stack, so going back lands on / (no query string).
    await expect(page).not.toHaveURL(/verified=true/);

    // The success banner must not be visible — it was a one-time notification
    await expect(page.getByTestId("verified-success")).not.toBeVisible();
  });
});
