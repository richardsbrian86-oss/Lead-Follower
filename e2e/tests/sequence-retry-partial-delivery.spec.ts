/**
 * Regression coverage for retrying a sequence after only one channel
 * completed. The retry must resume the same step without inserting another
 * message for a channel whose provider may already have accepted it.
 */

import { test, expect, type Page } from "@playwright/test";
import pg from "pg";
import {
  createTestUser,
  deleteTestUser,
  signInAsUser,
  type TestUser,
} from "../helpers/session.js";

const { Pool } = pg;

type ChannelStatus = "sent" | "pending";

async function createGym(page: Page, name: string): Promise<string> {
  const response = await page.request.post("/api/gyms", {
    data: { gymName: name },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { gym: { id: string } };
  return body.gym.id;
}

async function seedPartialDelivery(
  gymId: string,
  deliveredChannelStatus: ChannelStatus,
): Promise<{ leadId: number; sequenceId: number; deliveredMessageId: number; failedMessageId: number }> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const lead = await pool.query<{ id: number }>(
      `INSERT INTO leads (gym_id, name, email, phone, visit_date)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [gymId, "Partial Delivery Test Lead", "partial-delivery@example.com", "+15555550101"],
    );
    const leadId = lead.rows[0].id;

    const sequence = await pool.query<{ id: number }>(
      `INSERT INTO lead_sequences
         (lead_id, gym_id, current_step, paused, cancelled, status, failure_reason, next_send_at)
       VALUES ($1, $2, 0, false, false, 'failed', $3, NULL)
       RETURNING id`,
      [leadId, gymId, "SMS provider temporarily unavailable"],
    );
    const sequenceId = sequence.rows[0].id;

    const delivered = await pool.query<{ id: number }>(
      `INSERT INTO outbound_messages
         (lead_id, gym_id, channel, subject, body, status, sequence_step)
       VALUES ($1, $2, 'email', $3, $4, $5, 0)
       RETURNING id`,
      [
        leadId,
        gymId,
        "Following up from Flow State",
        "We would love to see you again.",
        deliveredChannelStatus,
      ],
    );
    const failed = await pool.query<{ id: number }>(
      `INSERT INTO outbound_messages
         (lead_id, gym_id, channel, body, status, error_message, sequence_step)
       VALUES ($1, $2, 'sms', $3, 'failed', $4, 0)
       RETURNING id`,
      [leadId, gymId, "We would love to see you again.", "Provider unavailable"],
    );

    return {
      leadId,
      sequenceId,
      deliveredMessageId: delivered.rows[0].id,
      failedMessageId: failed.rows[0].id,
    };
  } finally {
    await pool.end();
  }
}

async function readRetryState(leadId: number): Promise<{
  sequence: { id: number; current_step: number; status: string; next_send_at: Date | null };
  messages: Array<{ id: number; channel: string; status: string }>;
}> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const sequence = await pool.query<{
      id: number;
      current_step: number;
      status: string;
      next_send_at: Date | null;
    }>(
      `SELECT id, current_step, status, next_send_at
       FROM lead_sequences
       WHERE lead_id = $1`,
      [leadId],
    );
    const messages = await pool.query<{ id: number; channel: string; status: string }>(
      `SELECT id, channel, status
       FROM outbound_messages
       WHERE lead_id = $1 AND sequence_step = 0
       ORDER BY id`,
      [leadId],
    );
    return { sequence: sequence.rows[0], messages: messages.rows };
  } finally {
    await pool.end();
  }
}

async function deleteFixture(gymId: string): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("DELETE FROM outbound_messages WHERE gym_id = $1", [gymId]);
    await pool.query("DELETE FROM lead_sequences WHERE gym_id = $1", [gymId]);
    await pool.query("DELETE FROM leads WHERE gym_id = $1", [gymId]);
    await pool.query("DELETE FROM sequence_templates WHERE gym_id = $1", [gymId]);
    await pool.query("DELETE FROM gyms WHERE id = $1", [gymId]);
  } finally {
    await pool.end();
  }
}

test.describe("Sequence retry — partial channel delivery", () => {
  test.describe.configure({ mode: "serial" });

  let user: TestUser;
  let gymId: string | undefined;

  test.beforeAll(async () => {
    user = await createTestUser("e2e-sequence-retry");
  });

  test.afterAll(async () => {
    if (gymId) await deleteFixture(gymId);
    if (user) await deleteTestUser(user);
  });

  for (const deliveredChannelStatus of ["sent", "pending"] as const) {
    test(`preserves an existing ${deliveredChannelStatus} channel while retrying the failed channel`, async ({
      page,
    }) => {
      await signInAsUser(page, user);
      gymId = await createGym(page, `E2E Partial Retry ${deliveredChannelStatus}`);
      try {
        const fixture = await seedPartialDelivery(gymId, deliveredChannelStatus);

        const response = await page.request.post(`/api/leads/${fixture.leadId}/sequence/retry`);
        expect(response.status()).toBe(200);
        const retryBody = (await response.json()) as {
          currentStep: number;
          status: string;
          nextSendAt: string | null;
        };
        expect(retryBody.currentStep).toBe(0);
        expect(retryBody.status).toBe("active");
        expect(retryBody.nextSendAt).not.toBeNull();

        const state = await readRetryState(fixture.leadId);
        expect(state.sequence.id).toBe(fixture.sequenceId);
        expect(state.sequence.current_step).toBe(0);
        expect(state.sequence.status).toBe("active");
        expect(state.sequence.next_send_at).not.toBeNull();
        expect(state.messages).toEqual([
          { id: fixture.deliveredMessageId, channel: "email", status: deliveredChannelStatus },
          { id: fixture.failedMessageId, channel: "sms", status: "failed" },
        ]);
      } finally {
        await deleteFixture(gymId);
        gymId = undefined;
      }
    });
  }
});