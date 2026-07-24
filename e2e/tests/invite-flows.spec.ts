/**
 * E2E tests for the staff invite system:
 *   - Accept invite via token link → staff account created + auto-logged in
 *   - Invalid/expired token → shows clear error
 *   - Owner sees Team page with staff list and invite form
 *   - Staff does NOT see Team link in sidebar
 */

import { test, expect } from "@playwright/test";
import crypto from "crypto";
import {
  registerAndVerifyUser,
  createTestInvite,
  deleteGymAndAllUsers,
} from "../helpers/auth.js";

function uid(): string {
  return crypto.randomBytes(4).toString("hex");
}

const PASSWORD = "Password123!";

// ---------------------------------------------------------------------------
// Accept invite flow
// ---------------------------------------------------------------------------

test.describe("Accept invite flow", () => {
  const ownerEmail = `owner-inv-${uid()}@test.example`;
  const staffEmail = `staff-inv-${uid()}@test.example`;
  const inviteToken = crypto.randomBytes(32).toString("hex");

  test.beforeAll(async () => {
    await registerAndVerifyUser(ownerEmail, PASSWORD, "Gym Owner", "Invite Test Gym");
    await createTestInvite(ownerEmail, staffEmail, inviteToken);
  });

  test.afterAll(async () => {
    await deleteGymAndAllUsers(ownerEmail);
  });

  test("valid invite token — creates staff account and auto-logs in", async ({ page }) => {
    await page.goto(`/?invite=${inviteToken}`);

    // Wait for invite details to load and form to render
    await expect(page.getByRole("heading", { name: /Invite Test Gym/ })).toBeVisible();
    await expect(page.getByText("Set up your account to get started")).toBeVisible();

    // The email field should be pre-filled and read-only
    await expect(page.locator("#invite-email")).toHaveValue(staffEmail);

    // Fill name + password
    await page.getByPlaceholder("Jane Smith").fill("Staff Member");
    await page.getByPlaceholder("8+ characters").fill(PASSWORD);
    await page.getByPlaceholder("Same as above").fill(PASSWORD);
    await page.getByRole("button", { name: /Join/i }).click();

    // Should be auto-logged in and see the dashboard nav
    await expect(page.getByText("Leads Pipeline")).toBeVisible();
  });

  test("expired/invalid token — shows error with contact message", async ({ page }) => {
    const badToken = crypto.randomBytes(32).toString("hex");
    await page.goto(`/?invite=${badToken}`);

    await expect(page.getByText("Invite link invalid")).toBeVisible();
    await expect(page.getByText(/Contact your gym owner/i)).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Team page visibility
// ---------------------------------------------------------------------------

test.describe("Team page — owner sees it, staff does not", () => {
  const ownerEmail = `owner-vis-${uid()}@test.example`;
  const staffEmail = `staff-vis-${uid()}@test.example`;
  const inviteToken = crypto.randomBytes(32).toString("hex");

  test.beforeAll(async () => {
    const BASE_URL = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "http://localhost:3000";

    await registerAndVerifyUser(ownerEmail, PASSWORD, "Owner Two", "Visibility Gym");
    await createTestInvite(ownerEmail, staffEmail, inviteToken);

    // Accept the invite via API to create the staff user ahead of UI tests
    await fetch(`${BASE_URL}/api/auth/accept-invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: inviteToken, name: "Staff Two", password: PASSWORD }),
    });
  });

  test.afterAll(async () => {
    await deleteGymAndAllUsers(ownerEmail);
  });

  test("owner sees Team link in sidebar", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("you@example.com").fill(ownerEmail);
    await page.getByPlaceholder("Your password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Leads Pipeline")).toBeVisible();
    await expect(page.getByRole("link", { name: "Team" })).toBeVisible();
  });

  test("owner can view the Team page with staff list", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("you@example.com").fill(ownerEmail);
    await page.getByPlaceholder("Your password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Leads Pipeline")).toBeVisible();
    await page.getByRole("link", { name: "Team" }).click();

    // Team page heading (h1)
    await expect(page.locator("h1").filter({ hasText: "Team" })).toBeVisible();
    await expect(page.getByText("Invite a team member")).toBeVisible();

    // The accepted staff user should appear in the members list
    await expect(page.getByText(staffEmail)).toBeVisible();
  });

  test("staff does NOT see Team link in sidebar", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("you@example.com").fill(staffEmail);
    await page.getByPlaceholder("Your password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Leads Pipeline")).toBeVisible();
    await expect(page.getByRole("link", { name: "Team" })).not.toBeVisible();
  });
});
