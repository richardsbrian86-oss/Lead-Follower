/**
 * E2E tests for the Dashboard's error handling when /api/dashboard/summary
 * fails to load.
 *
 * Uses the dev-only harness route /__e2e/dashboard (gym-leads app), which
 * renders <Dashboard /> outside the Clerk auth gate. Clerk browser sessions
 * cannot be established in the Replit dev environment (FAPI cross-origin
 * limitation), so the harness is the supported way to exercise this
 * component's network states end-to-end in a real browser.
 *
 * Scenario:
 *   The summary request fails → the dashboard renders its error banner
 *   instead of a blank page or a crash, and none of the stat cards render.
 */

import { test, expect } from "@playwright/test";

const SUMMARY_URL = "**/api/dashboard/summary";
const ACTION_QUEUE_URL = "**/api/dashboard/action-queue";
const HARNESS_PATH = "/__e2e/dashboard";

test.describe("Dashboard — summary request fails", () => {
  test("shows the error banner instead of a blank or crashed page", async ({
    page,
  }) => {
    // Keep the action queue (rendered inside Dashboard) out of the way with a
    // clean success response — this test is only about the summary failure.
    await page.route(ACTION_QUEUE_URL, async (route) => {
      await route.fulfill({ json: { actions: [] } });
    });

    await page.route(SUMMARY_URL, async (route) => {
      await route.abort("connectionrefused");
    });

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto(HARNESS_PATH);

    const banner = page.getByTestId("dashboard-error-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Error loading dashboard");
    await expect(banner).toContainText("Could not fetch the latest pipeline data.");

    // None of the normal stat cards should render alongside the error state.
    await expect(page.getByText("Total Pipeline")).not.toBeVisible();
    await expect(page.getByText("Overview")).not.toBeVisible();

    // The page rendered real content, not a blank screen, and the client
    // didn't throw while handling the failed request.
    await expect(page.getByTestId("dashboard-harness")).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test("recovers and shows stats once the summary request succeeds", async ({
    page,
  }) => {
    await page.route(ACTION_QUEUE_URL, async (route) => {
      await route.fulfill({ json: { actions: [] } });
    });

    let failRequests = true;
    await page.route(SUMMARY_URL, async (route) => {
      if (failRequests) {
        await route.abort("connectionrefused");
      } else {
        await route.fulfill({
          json: {
            totalLeads: 42,
            followUpsDueToday: 3,
            conversionRate: 12.5,
            newLeads: 7,
            contactedLeads: 10,
            interestedLeads: 5,
            wonLeads: 4,
            lostLeads: 1,
            recentLeads: [],
            hotLeads: [],
          },
        });
      }
    });

    await page.goto(HARNESS_PATH);
    await expect(page.getByTestId("dashboard-error-banner")).toBeVisible();

    // Simulate the server recovering, then trigger TanStack Query's
    // automatic retry by reloading the harness (retry: 1 already runs
    // against the still-failing mock above; reload is the deterministic way
    // to get a fresh request once the mock is fixed).
    failRequests = false;
    await page.reload();

    await expect(page.getByTestId("dashboard-error-banner")).not.toBeVisible();
    await expect(page.getByText("Total Pipeline")).toBeVisible();
    await expect(page.getByText("42")).toBeVisible();
  });
});
