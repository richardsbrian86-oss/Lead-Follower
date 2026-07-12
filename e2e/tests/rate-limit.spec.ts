/**
 * E2E tests for the strict rate limiter on AI/send endpoints.
 *
 * Covered endpoints and their per-IP limits (app.ts):
 *   POST /api/leads/:id/messages/draft  — 50 req / 15-min window
 *   POST /api/leads/:id/messages/send   — 20 req / 15-min window
 *
 * These tests send the minimal request body and accept any non-429 status code
 * (200, 400, 401, 404, etc.) for requests within the limit, then assert 429
 * once the threshold is crossed.  The actual business-logic response is
 * irrelevant — what matters is that the rate-limit layer fires before
 * requireAuth or the route handler.
 *
 * NOTE: The rate-limit window is per-IP and persists for 15 minutes in the dev
 * environment.  If this suite is run multiple times within the same window
 * against the same server, earlier runs may have already consumed some of the
 * quota, which means 429 can appear before the threshold request — this is
 * still a passing result.
 */

import { test, expect } from "@playwright/test";

const PLACEHOLDER_LEAD_ID = "00000000-0000-0000-0000-000000000001";

// Per-IP per-window limits that match app.ts configuration
const DRAFT_LIMIT = 50;
const SEND_LIMIT = 20;

async function hammering(
  request: import("@playwright/test").APIRequestContext,
  endpoint: string,
  totalRequests: number,
  body: Record<string, unknown>,
): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < totalRequests; i++) {
    const resp = await request.post(endpoint, { data: body });
    statuses.push(resp.status());
    if (resp.status() === 429) break;
  }
  return statuses;
}

test.describe("Strict rate limiter — draft endpoint", () => {
  test("returns 429 with error body after exceeding draft rate limit threshold", async ({
    request,
  }) => {
    const endpoint = `/api/leads/${PLACEHOLDER_LEAD_ID}/messages/draft`;

    const statuses = await hammering(request, endpoint, DRAFT_LIMIT + 1, {
      tone: "friendly",
    });

    expect(statuses).toContain(429);

    const finalStatus = statuses[statuses.length - 1];
    expect(finalStatus).toBe(429);

    const resp = await request.post(endpoint, { data: { tone: "friendly" } });
    if (resp.status() === 429) {
      const body = await resp.json();
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error.toLowerCase()).toMatch(/rate limit/i);
    }
  });
});

test.describe("Strict rate limiter — send endpoint", () => {
  test("same per-window limit applies to the send endpoint", async ({
    request,
  }) => {
    const endpoint = `/api/leads/${PLACEHOLDER_LEAD_ID}/messages/send`;

    const statuses = await hammering(request, endpoint, SEND_LIMIT + 1, {
      message: "Hello from rate limit test",
      channel: "sms",
    });

    expect(statuses).toContain(429);
  });
});

test.describe("General rate limiter — API-wide limit", () => {
  test("GET /api/health-check is served without rate-limit error under normal load", async ({
    request,
  }) => {
    for (let i = 0; i < 5; i++) {
      const resp = await request.get("/api/healthz");
      expect(resp.status()).not.toBe(429);
    }
  });

  test("429 response body contains the expected error JSON shape", async ({
    request,
  }) => {
    const endpoint = `/api/leads/${PLACEHOLDER_LEAD_ID}/messages/draft`;

    let last429Body: Record<string, unknown> | null = null;

    // Draft limit may already be exhausted from the earlier suite — cap at
    // DRAFT_LIMIT + 1 but break early on the first 429.
    for (let i = 0; i < DRAFT_LIMIT + 1; i++) {
      const resp = await request.post(endpoint, {
        data: { tone: "professional" },
      });
      if (resp.status() === 429) {
        last429Body = await resp.json();
        break;
      }
    }

    expect(last429Body).not.toBeNull();
    expect(last429Body).toHaveProperty("error");
    expect(typeof last429Body!.error).toBe("string");
  });
});
