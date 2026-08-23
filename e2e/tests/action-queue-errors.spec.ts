/**
 * E2E tests for Action Queue error handling when the server is unreachable.
 *
 * Uses the dev-only harness route /__e2e/action-queue (gym-leads app), which
 * renders <ActionQueue /> outside the Clerk auth gate. Clerk browser sessions
 * cannot be established in the Replit dev environment (FAPI cross-origin
 * limitation), so the harness is the supported way to exercise this
 * component's network states end-to-end in a real browser.
 *
 * Scenarios:
 *   1. Initial load fails → error banner + Retry button appear; Retry with a
 *      recovered server loads the queue.
 *   2. Initial load succeeds, then a refetch fails → stale-data banner is
 *      shown and the list is rendered at reduced opacity (opacity-60).
 */

import { test, expect, type Page } from "@playwright/test";

const QUEUE_URL = "**/api/dashboard/action-queue";
const HARNESS_PATH = "/__e2e/action-queue";

const sampleQueue = {
  actions: [
    {
      leadId: 9001,
      name: "Test Lead One",
      email: "lead-one@test.example",
      phone: "+15550000001",
      status: "new",
      score: 82,
      urgencyScore: 90,
      primaryReason: "Overdue follow-up",
      secondaryReasons: ["High score"],
      daysSinceContact: 3,
      sequenceStepDue: null,
    },
    {
      leadId: 9002,
      name: "Test Lead Two",
      email: "lead-two@test.example",
      phone: "+15550000002",
      status: "contacted",
      score: 64,
      urgencyScore: 70,
      primaryReason: "Sequence step due",
      secondaryReasons: [],
      daysSinceContact: 1,
      sequenceStepDue: 2,
    },
  ],
};

async function clearDismissedLeads(page: Page): Promise<void> {
  // The component filters out locally-dismissed leads; make sure earlier
  // runs (or other tests) can't hide our fixture leads.
  await page.addInitScript(() => {
    try {
      for (const key of Object.keys(sessionStorage)) {
        if (key.toLowerCase().includes("dismiss")) sessionStorage.removeItem(key);
      }
    } catch {
      /* ignore */
    }
  });
}

test.describe("Action queue — server unreachable on initial load", () => {
  test("shows error banner with Retry button, and Retry recovers", async ({
    page,
  }) => {
    await clearDismissedLeads(page);

    let failRequests = true;
    let requestCount = 0;
    await page.route(QUEUE_URL, async (route) => {
      requestCount++;
      if (failRequests) {
        await route.abort("connectionrefused");
      } else {
        await route.fulfill({ json: sampleQueue });
      }
    });

    await page.goto(HARNESS_PATH);

    // Error banner + full-failure message + Retry button
    const banner = page.getByTestId("action-queue-error-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Failed to load the action queue");

    const retry = page.getByTestId("action-queue-retry");
    await expect(retry).toBeVisible();
    await expect(retry).toContainText("Retry");

    // Empty error state (no stale data to show)
    await expect(
      page.getByText("No data available. Use Retry above to try again."),
    ).toBeVisible();
    expect(requestCount).toBeGreaterThan(0);

    // Server comes back → Retry loads the queue and clears the banner
    failRequests = false;
    await retry.click();

    await expect(page.getByText("Test Lead One")).toBeVisible();
    await expect(banner).not.toBeVisible();
  });
});

test.describe("Action queue — refetch fails after successful load", () => {
  test("shows stale-data banner and renders last known data at reduced opacity", async ({
    page,
  }) => {
    await clearDismissedLeads(page);

    let failRequests = false;
    await page.route(QUEUE_URL, async (route) => {
      if (failRequests) {
        await route.abort("connectionrefused");
      } else {
        await route.fulfill({ json: sampleQueue });
      }
    });

    await page.goto(HARNESS_PATH);

    // Initial load succeeds — data visible, no banner, full opacity
    const list = page.getByTestId("action-queue-list");
    await expect(page.getByText("Test Lead One")).toBeVisible();
    await expect(
      page.getByTestId("action-queue-error-banner"),
    ).not.toBeVisible();
    await expect(list).not.toHaveClass(/opacity-60/);

    // Server goes down. Wait past the app's 10s staleTime, then trigger a
    // window-focus refetch (TanStack Query's default refetchOnWindowFocus).
    failRequests = true;
    await page.waitForTimeout(11_000);
    await page.evaluate(() => {
      // TanStack Query's focusManager listens for "visibilitychange" on
      // window — dispatch there (a plain document event doesn't bubble up).
      window.dispatchEvent(new Event("visibilitychange"));
      document.dispatchEvent(new Event("visibilitychange", { bubbles: true }));
      window.dispatchEvent(new Event("focus"));
    });

    // Stale-data banner appears with the "last known data" message + timestamp
    const banner = page.getByTestId("action-queue-error-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(
      "Couldn't refresh — showing last known data",
    );
    await expect(banner).toContainText(/Last updated/);

    // Stale data still rendered, but at reduced opacity
    await expect(page.getByText("Test Lead One")).toBeVisible();
    await expect(page.getByText("Test Lead Two")).toBeVisible();
    await expect(list).toHaveClass(/opacity-60/);

    // Retry button is available in the stale state too
    await expect(page.getByTestId("action-queue-retry")).toBeVisible();
  });
});
