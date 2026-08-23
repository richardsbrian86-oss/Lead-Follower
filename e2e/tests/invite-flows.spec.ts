/**
 * E2E tests for the staff invite system.
 *
 * After the Clerk migration, invite acceptance works as follows:
 *   1. Staff visits /accept-invite?token=... (our frontend page)
 *   2. The page validates the token via GET /api/auth/invite/:token and shows
 *      the gym name + invitee email with "Create account" / "Sign in" buttons.
 *   3. After Clerk sign-up/sign-in, HomeRedirect reads sessionStorage.inviteToken
 *      and POSTs to the authenticated /api/auth/consume-invite endpoint.
 *
 * What is tested here:
 *   - The /accept-invite page UI for valid and invalid tokens (no auth needed).
 *
 * What is NOT tested here (requires a real Clerk session in the browser,
 * which is not possible in the Replit dev environment due to FAPI cross-origin
 * restrictions):
 *   - Full invite acceptance flow through Clerk sign-up + consume-invite
 *   - Team page visibility per role (owner vs staff)
 *   - Owner removing a staff member
 * These flows are covered by manual smoke-testing or a future Clerk-capable
 * E2E mechanism (see follow-up task #76).
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

// ---------------------------------------------------------------------------
// Accept invite page UI
// ---------------------------------------------------------------------------

test.describe("Accept invite flow", () => {
  const ownerEmail = `owner-inv-${uid()}@test.example`;
  const staffEmail = `staff-inv-${uid()}@test.example`;
  const inviteToken = crypto.randomBytes(32).toString("hex");

  test.beforeAll(async () => {
    await registerAndVerifyUser(ownerEmail, "unused", "Gym Owner", "Invite Test Gym");
    await createTestInvite(ownerEmail, staffEmail, inviteToken);
  });

  test.afterAll(async () => {
    await deleteGymAndAllUsers(ownerEmail);
  });

  test("valid invite token — shows gym name and invitee email on accept-invite page", async ({
    page,
  }) => {
    await page.goto(`/accept-invite?token=${inviteToken}`);

    await expect(
      page.getByRole("heading", { name: /Invite Test Gym/i }),
    ).toBeVisible();
    await expect(page.getByText(staffEmail)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Create account/i }),
    ).toBeVisible();
  });

  test("expired/invalid token — shows error with contact message", async ({
    page,
  }) => {
    const badToken = crypto.randomBytes(32).toString("hex");
    await page.goto(`/accept-invite?token=${badToken}`);

    await expect(page.getByText("Invite link invalid")).toBeVisible();
    await expect(page.getByText(/Contact your gym owner/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).not.toBeVisible();
  });

  test("temporary validation failure — offers retry and recovers without losing the invite", async ({
    page,
  }) => {
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => pageErrors.push(error));

    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      let hasFailed = false;
      window.fetch = (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (url.includes("/api/auth/invite/") && !hasFailed) {
          hasFailed = true;
          return Promise.reject(new Error("Invite validation request failed"));
        }

        return originalFetch(input, init);
      };
    });

    await page.goto(`/accept-invite?token=${inviteToken}`);

    await expect(page.getByText("Invite link invalid")).toBeVisible();
    await expect(
      page.getByText("Invite validation request failed"),
    ).toBeVisible();
    await expect(page.getByText(/Contact your gym owner/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(
      page.getByRole("heading", { name: /Invite Test Gym/i }),
    ).toBeVisible();
    await expect(page.getByText(staffEmail)).toBeVisible();
    await expect(page.locator("vite-error-overlay")).not.toBeAttached();
    expect(pageErrors).toEqual([]);
  });
});
