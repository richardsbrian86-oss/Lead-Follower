/**
 * Regression coverage for "dismiss for today":
 * - dismissing a queue item removes it from the rendered queue;
 * - the dismissal survives a remount/navigation in the same session;
 * - a new local day clears the dismissal;
 * - adding a note from lead detail auto-dismisses the lead before returning
 *   to the dashboard queue.
 *
 * The queue and lead-detail routes are development-only harness paths (the
 * latter keeps the real /leads/:id URL), so these tests do not need Clerk.
 */

import { test, expect, type Page } from "@playwright/test";

const QUEUE_URL = /\/api\/dashboard\/action-queue(?:\?.*)?$/;
const LEAD_URL = /\/api\/leads\/9001(?:\?.*)?$/;
const EVENT_URL = /\/api\/leads\/9001\/events(?:\?.*)?$/;
const QUEUE_PATH = "/__e2e/action-queue";
const LEAD_PATH = "/leads/9001";

const sampleAction = {
  leadId: 9001,
  name: "Dismissible Lead",
  email: "dismissible@test.example",
  phone: "+15550000001",
  status: "new",
  score: 82,
  urgencyScore: 90,
  primaryReason: "Overdue follow-up",
  secondaryReasons: ["High score"],
  daysSinceContact: 3,
  sequenceStepDue: null,
};

const sampleQueue = { actions: [sampleAction] };

const sampleLead = {
  id: 9001,
  name: sampleAction.name,
  email: sampleAction.email,
  phone: sampleAction.phone,
  visitDate: "2026-08-20T00:00:00.000Z",
  status: "new",
  notes: null,
  score: sampleAction.score,
  scoreFactors: null,
  createdAt: "2026-08-20T00:00:00.000Z",
  updatedAt: "2026-08-20T00:00:00.000Z",
  events: [],
};

async function mockQueue(page: Page): Promise<void> {
  await page.route(QUEUE_URL, (route) => route.fulfill({ json: sampleQueue }));
}

async function useDate(page: Page, isoDate: string): Promise<void> {
  await page.addInitScript((date) => {
    const RealDate = Date;
    const fixedTime = RealDate.parse(date);
    class MockDate extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(fixedTime);
        } else {
          super(args[0]);
        }
      }

      static now(): number {
        return fixedTime;
      }
    }
    // Keep instanceof checks and Date parsing behavior while freezing only
    // calls that request the current time.
    window.Date = MockDate as DateConstructor;
  }, isoDate);
}

async function clearDismissedLeads(page: Page): Promise<void> {
  // Run cleanup once before the test's first app navigation. An init script
  // would also run on reload and erase the dismissal being verified.
  await page.goto(QUEUE_PATH);
  await page.evaluate(() => sessionStorage.removeItem("dismissedLeads"));
}

test.describe("Dismissed leads", () => {
  test("hides a dismissed lead and keeps it hidden after a same-session remount", async ({
    page,
  }) => {
    await clearDismissedLeads(page);
    await mockQueue(page);
    await page.goto(QUEUE_PATH);

    await expect(page.getByText(sampleAction.name)).toBeVisible();
    await page.getByTitle("Dismiss for today").click();
    await expect(page.getByText(sampleAction.name)).not.toBeVisible();
    await expect(page.getByText("All caught up for today")).toBeVisible();

    // Remounting the queue (as when navigating away and back) rereads the
    // same sessionStorage value instead of restoring the dismissed item.
    await page.reload();
    await expect(page.getByText(sampleAction.name)).not.toBeVisible();
  });

  test("shows a previously dismissed lead again on the next day", async ({
    page,
  }) => {
    await clearDismissedLeads(page);
    await useDate(page, "2026-08-24T10:00:00");
    await page.addInitScript(() => {
      sessionStorage.setItem(
        "dismissedLeads",
        JSON.stringify({ date: "2026-08-23", ids: [9001] }),
      );
    });
    await mockQueue(page);
    await page.goto(QUEUE_PATH);

    // A fresh document on the next local date treats yesterday's storage as
    // stale and the lead is available again.
    await expect(page.getByText(sampleAction.name)).toBeVisible();
  });

  test("auto-dismisses a lead after adding a note from lead detail", async ({
    page,
  }) => {
    await clearDismissedLeads(page);
    await mockQueue(page);
    await page.route(LEAD_URL, (route) => route.fulfill({ json: sampleLead }));
    await page.route(EVENT_URL, (route) =>
      route.fulfill({
        status: 201,
        json: {
          id: 1,
          leadId: 9001,
          type: "note",
          note: "Called and left a voicemail",
          createdAt: "2026-08-23T10:00:00.000Z",
        },
      }),
    );
    await page.goto(QUEUE_PATH);
    await expect(page.getByText(sampleAction.name)).toBeVisible();

    await page.getByTitle("View lead").click();
    await expect(page.getByRole("heading", { name: sampleAction.name })).toBeVisible();
    await page.getByPlaceholder("Log a call, note, or follow-up...").fill(
      "Called and left a voicemail",
    );
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Note Added", { exact: true })).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId("action-queue-harness")).toBeVisible();
    await expect(page.getByText(sampleAction.name)).not.toBeVisible();
  });
});