/**
 * E2E tests for the email+password authentication flows:
 *   - Register (happy path, duplicate email)
 *   - Login (success, wrong password, unverified account)
 *   - Forgot password (form submission)
 *   - Reset password (valid token, expired token)
 *   - Logout (browser-level, back to login gate)
 *
 * All user-creation is done via the registration API + a direct DB update so we
 * never depend on email delivery in CI.
 */

import { test, expect } from "@playwright/test";
import crypto from "crypto";
import {
  registerAndVerifyUser,
  registerUnverifiedUser,
  setResetToken,
  deleteTestUserByEmail,
  insertUnverifiedUserWithToken,
} from "../helpers/auth.js";

function uid(): string {
  return crypto.randomBytes(4).toString("hex");
}

const PASSWORD = "Password123!";

// ---------------------------------------------------------------------------
// Register flow
// ---------------------------------------------------------------------------

test.describe("Register flow", () => {
  test("happy path — shows check-email confirmation", async ({ page }) => {
    const email = `reg-ok-${uid()}@test.example`;
    const name = "Register OK";

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Create one" }).click();
    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible();

    await page.getByPlaceholder("Jane Smith").fill(name);
    await page.getByPlaceholder("CrossFit Central").fill("Test Gym");
    await page.getByPlaceholder("you@example.com").fill(email);
    await page.getByPlaceholder("8+ characters").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText("Check your email")).toBeVisible();

    await deleteTestUserByEmail(email);
  });

  test("duplicate email — shows error message", async ({ page }) => {
    const email = `reg-dup-${uid()}@test.example`;
    await registerAndVerifyUser(email, PASSWORD, "Dup Tester");

    try {
      await page.goto("/");
      await page.getByRole("button", { name: "Create one" }).click();

      await page.getByPlaceholder("Jane Smith").fill("Dup Tester 2");
      await page.getByPlaceholder("CrossFit Central").fill("Another Gym");
      await page.getByPlaceholder("you@example.com").fill(email);
      await page.getByPlaceholder("8+ characters").fill(PASSWORD);
      await page.getByRole("button", { name: "Create account" }).click();

      await expect(
        page.getByText("An account with that email already exists"),
      ).toBeVisible();
    } finally {
      await deleteTestUserByEmail(email);
    }
  });
});

// ---------------------------------------------------------------------------
// Login flow
// ---------------------------------------------------------------------------

test.describe("Login flow", () => {
  const email = `login-${uid()}@test.example`;

  test.beforeAll(async () => {
    await registerAndVerifyUser(email, PASSWORD, "Login Tester");
  });

  test.afterAll(async () => {
    await deleteTestUserByEmail(email);
  });

  test("success — navigates to dashboard", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("you@example.com").fill(email);
    await page.getByPlaceholder("Your password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Leads Pipeline")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("wrong password — shows invalid credentials error", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByPlaceholder("you@example.com").fill(email);
    await page.getByPlaceholder("Your password").fill("WrongPass999!");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByText("Invalid email or password"),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  });

  test("unverified account — shows verification prompt", async ({ page }) => {
    const unvEmail = `unver-${uid()}@test.example`;
    await registerUnverifiedUser(unvEmail, PASSWORD, "Unverified User");

    try {
      await page.goto("/");
      await page.getByPlaceholder("you@example.com").fill(unvEmail);
      await page.getByPlaceholder("Your password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();

      await expect(
        page.getByText(/verify your email/i),
      ).toBeVisible();
    } finally {
      await deleteTestUserByEmail(unvEmail);
    }
  });
});

// ---------------------------------------------------------------------------
// Forgot password flow
// ---------------------------------------------------------------------------

test.describe("Forgot password flow", () => {
  test("submitting a valid email shows confirmation message", async ({
    page,
  }) => {
    const email = `forgot-${uid()}@test.example`;
    await registerAndVerifyUser(email, PASSWORD, "Forgot Tester");

    try {
      await page.goto("/");
      await page.getByRole("button", { name: "Forgot password?" }).click();

      await expect(
        page.getByRole("heading", { name: "Reset your password" }),
      ).toBeVisible();

      await page.getByPlaceholder("you@example.com").fill(email);
      await page.getByRole("button", { name: "Send reset link" }).click();

      await expect(
        page.getByText("you'll receive a reset link shortly"),
      ).toBeVisible();
    } finally {
      await deleteTestUserByEmail(email);
    }
  });

  test("submitting an unknown email still shows confirmation (no leak)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Forgot password?" }).click();

    await page
      .getByPlaceholder("you@example.com")
      .fill(`nobody-${uid()}@test.example`);
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(
      page.getByText("you'll receive a reset link shortly"),
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Reset password flow
// ---------------------------------------------------------------------------

test.describe("Reset password flow", () => {
  test("valid token — password updated, redirected to sign in", async ({
    page,
  }) => {
    const email = `reset-ok-${uid()}@test.example`;
    await registerAndVerifyUser(email, PASSWORD, "Reset Tester");

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await setResetToken(email, resetToken, expiry);

    try {
      await page.goto(`/?token=${resetToken}`);

      await expect(
        page.getByRole("heading", { name: "Set new password" }),
      ).toBeVisible();

      await page.getByPlaceholder("8+ characters").fill("NewPass123!");
      await page.getByPlaceholder("Same as above").fill("NewPass123!");
      await page.getByRole("button", { name: "Set new password" }).click();

      await expect(
        page.getByRole("heading", { name: "Welcome back" }),
      ).toBeVisible();
    } finally {
      await deleteTestUserByEmail(email);
    }
  });

  test("expired token — shows invalid/expired error", async ({ page }) => {
    const email = `reset-exp-${uid()}@test.example`;
    await registerAndVerifyUser(email, PASSWORD, "Expired Reset Tester");

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() - 1000); // already expired
    await setResetToken(email, resetToken, expiry);

    try {
      await page.goto(`/?token=${resetToken}`);

      await expect(
        page.getByRole("heading", { name: "Set new password" }),
      ).toBeVisible();

      await page.getByPlaceholder("8+ characters").fill("NewPass123!");
      await page.getByPlaceholder("Same as above").fill("NewPass123!");
      await page.getByRole("button", { name: "Set new password" }).click();

      await expect(
        page.getByText(/invalid or has expired/i),
      ).toBeVisible();
    } finally {
      await deleteTestUserByEmail(email);
    }
  });
});

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
      await expect(
        page.getByTestId("verified-success"),
      ).toBeVisible();
      await expect(
        page.getByText(/email verified/i),
      ).toBeVisible();
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

    await expect(
      page.getByTestId("verified-invalid"),
    ).toBeVisible();
    await expect(
      page.getByText(/invalid or has expired/i),
    ).toBeVisible();
  });

  test("expired token — redirects with invalid status", async ({ page }) => {
    const email = `verify-exp-${uid()}@test.example`;
    const token = crypto.randomBytes(32).toString("hex");
    // expiresInMs = -1000 means the token is already in the past
    await insertUnverifiedUserWithToken(email, token, -1000);

    try {
      await page.goto(`/api/auth/verify-email?token=${token}`);

      await expect(page).toHaveURL(/verified=invalid/);

      await expect(
        page.getByTestId("verified-invalid"),
      ).toBeVisible();
    } finally {
      await deleteTestUserByEmail(email);
    }
  });

  test("missing token — redirects with invalid status", async ({ page }) => {
    await page.goto("/api/auth/verify-email");

    await expect(page).toHaveURL(/verified=invalid/);

    await expect(
      page.getByTestId("verified-invalid"),
    ).toBeVisible();
  });

  test("signed-in user visiting /?verified=true is redirected to app without seeing the banner", async ({
    page,
  }) => {
    const email = `signed-verified-${uid()}@test.example`;
    await registerAndVerifyUser(email, PASSWORD, "Already Signed In");

    try {
      // Sign in via Clerk UI first
      await page.goto("/");
      await page.getByPlaceholder("you@example.com").fill(email);
      await page.getByPlaceholder("Your password").fill(PASSWORD);
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page.getByText("Leads Pipeline")).toBeVisible();

      // Now navigate to /?verified=true while already signed in
      await page.goto("/?verified=true");

      // Banner must NOT appear for a signed-in user
      await expect(page.getByTestId("verified-success")).not.toBeVisible();

      // The ?verified query param should have been stripped from the URL
      await expect(page).not.toHaveURL(/verified/);

      // The app content (not the landing page) should be visible
      await expect(page.getByText("Leads Pipeline")).toBeVisible();
    } finally {
      await deleteTestUserByEmail(email);
    }
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

// ---------------------------------------------------------------------------
// Logout flow (browser-level)
// ---------------------------------------------------------------------------

test.describe("Logout flow", () => {
  const email = `logout-${uid()}@test.example`;

  test.beforeAll(async () => {
    await registerAndVerifyUser(email, PASSWORD, "Logout Tester");
  });

  test.afterAll(async () => {
    await deleteTestUserByEmail(email);
  });

  test("logout button returns user to the login gate", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("you@example.com").fill(email);
    await page.getByPlaceholder("Your password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Leads Pipeline")).toBeVisible();

    await page.locator('button[title="Sign out"]').click();

    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(page.getByText("Leads Pipeline")).not.toBeVisible();
  });
});
