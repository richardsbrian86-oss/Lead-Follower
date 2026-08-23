/**
 * Regression coverage for the gym boundary on AI conversations.
 *
 * The requests run through the real API with real Clerk sessions. A second
 * gym's conversation is intentionally seeded directly in the database so the
 * tests can prove that route handlers do not expose, mutate, or append to it.
 */

import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import crypto from "crypto";
import {
  createTestUser,
  deleteTestUser,
  signInAsUser,
  type TestUser,
} from "../helpers/session.js";

const { Pool } = pg;

type ApiResult = {
  status: number;
  body: unknown;
};

function uid(): string {
  return crypto.randomBytes(5).toString("hex");
}

async function api(
  page: Page,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<ApiResult> {
  return page.evaluate(
    async ({ method, path, body }) => {
      const response = await fetch(path, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      return { status: response.status, body: parsed };
    },
    { method, path, body },
  );
}

async function createGym(page: Page, name: string): Promise<string> {
  const result = await api(page, "POST", "/api/gyms", { gymName: name });
  expect(result.status).toBe(201);
  return (result.body as { gym: { id: string } }).gym.id;
}

test.describe("AI conversation tenant isolation", () => {
  test.describe.configure({ mode: "serial" });

  let ownerA: TestUser;
  let ownerB: TestUser;
  let noGymUser: TestUser;
  let contextA: import("@playwright/test").BrowserContext;
  let contextB: import("@playwright/test").BrowserContext;
  let noGymContext: import("@playwright/test").BrowserContext;
  let conversationBId: number;
  let foreignMessageId: number;
  let gymAId: string;
  let gymBId: string;

  test.beforeAll(async ({ browser }) => {
    ownerA = await createTestUser("ai-tenant-a");
    ownerB = await createTestUser("ai-tenant-b");
    noGymUser = await createTestUser("ai-tenant-no-gym");

    contextA = await browser.newContext();
    contextB = await browser.newContext();
    noGymContext = await browser.newContext();

    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    await signInAsUser(pageA, ownerA);
    await signInAsUser(pageB, ownerB);

    gymAId = await createGym(pageA, `AI Tenant A ${uid()}`);
    gymBId = await createGym(pageB, `AI Tenant B ${uid()}`);

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const conversation = await pool.query<{ id: number }>(
        `INSERT INTO conversations (gym_id, title)
         VALUES ($1, $2)
         RETURNING id`,
        [gymBId, "Tenant B private conversation"],
      );
      conversationBId = conversation.rows[0].id;

      const message = await pool.query<{ id: number }>(
        `INSERT INTO messages (gym_id, conversation_id, role, content)
         VALUES ($1, $2, 'assistant', $3)
         RETURNING id`,
        [gymBId, conversationBId, "Tenant B private message"],
      );
      foreignMessageId = message.rows[0].id;
    } finally {
      await pool.end();
    }

    await pageA.close();
    await pageB.close();
  });

  test.afterAll(async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      if (conversationBId) {
        await pool.query("DELETE FROM conversations WHERE id = $1", [conversationBId]);
      }
      if (gymAId) {
        await pool.query("DELETE FROM conversations WHERE gym_id = $1", [gymAId]);
      }
      if (gymBId) {
        await pool.query("DELETE FROM conversations WHERE gym_id = $1", [gymBId]);
      }
    } finally {
      await pool.end();
    }

    await Promise.all([
      contextA?.close(),
      contextB?.close(),
      noGymContext?.close(),
      ownerA && deleteTestUser(ownerA),
      ownerB && deleteTestUser(ownerB),
      noGymUser && deleteTestUser(noGymUser),
    ]);
  });

  test("does not list a conversation owned by another gym", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signInAsUser(page, ownerA);

    const result = await api(page, "GET", "/api/anthropic/conversations");

    expect(result.status).toBe(200);
    expect(result.body).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: conversationBId })]),
    );
    await context.close();
  });

  test("blocks get, delete, message-list, and message-post across gyms", async () => {
    const page = await contextA.newPage();
    await page.goto("/");
    const path = `/api/anthropic/conversations/${conversationBId}`;

    const getResult = await api(page, "GET", path);
    expect(getResult.status).toBe(404);

    const deleteResult = await api(page, "DELETE", path);
    expect(deleteResult.status).toBe(404);

    const messagesResult = await api(page, "GET", `${path}/messages`);
    expect(messagesResult.status).toBe(404);

    const postResult = await api(page, "POST", `${path}/messages`, {
      content: "This must not be added to Tenant B",
    });
    expect(postResult.status).toBe(404);
    await page.close();

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const conversation = await pool.query(
        "SELECT id, gym_id FROM conversations WHERE id = $1",
        [conversationBId],
      );
      const message = await pool.query(
        "SELECT id, gym_id, content FROM messages WHERE id = $1",
        [foreignMessageId],
      );
      expect(conversation.rows).toEqual([{ id: conversationBId, gym_id: gymBId }]);
      expect(message.rows).toEqual([
        { id: foreignMessageId, gym_id: gymBId, content: "Tenant B private message" },
      ]);
    } finally {
      await pool.end();
    }
  });

  test("stamps new conversations and user messages with the authenticated gym", async () => {
    const page = await contextA.newPage();
    await page.goto("/");

    const created = await api(page, "POST", "/api/anthropic/conversations", {
      title: "Tenant A conversation",
    });
    expect(created.status).toBe(201);
    const conversationId = (created.body as { id: number; gymId: string }).id;
    expect((created.body as { gymId: string }).gymId).toBe(gymAId);

    const postResult = await api(
      page,
      "POST",
      `/api/anthropic/conversations/${conversationId}/messages`,
      { content: "A message from Tenant A" },
    );
    expect(postResult.status).toBe(200);
    await page.close();

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const conversation = await pool.query(
        "SELECT gym_id FROM conversations WHERE id = $1",
        [conversationId],
      );
      const message = await pool.query(
        `SELECT gym_id, role, content
         FROM messages
         WHERE conversation_id = $1
         ORDER BY id`,
        [conversationId],
      );
      expect(conversation.rows).toEqual([{ gym_id: gymAId }]);
      expect(message.rows.length).toBeGreaterThanOrEqual(1);
      expect(message.rows.every((row) => row.gym_id === gymAId)).toBe(true);
      expect(message.rows).toContainEqual({
        gym_id: gymAId,
        role: "user",
        content: "A message from Tenant A",
      });
    } finally {
      await pool.end();
    }
  });

  test("rejects AI conversation access for an authenticated user without a gym", async () => {
    const page = await noGymContext.newPage();
    await signInAsUser(page, noGymUser);

    const listResult = await api(page, "GET", "/api/anthropic/conversations");
    expect(listResult.status).toBe(403);
    expect(listResult.body).toEqual({
      error: "No gym assigned to your account. Contact your administrator.",
    });

    const createResult = await api(page, "POST", "/api/anthropic/conversations", {
      title: "Should not be created",
    });
    expect(createResult.status).toBe(403);
    await page.close();
  });
});