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
