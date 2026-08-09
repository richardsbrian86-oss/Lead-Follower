/**
 * Auth test helpers — DB-level fixtures only.
 *
 * After the Clerk migration, registration/login/logout are handled by Clerk.
 * These helpers only perform direct DB operations for test fixture setup and
 * teardown, or for flows that are still owned by our API (e.g. email
 * verification, invite consumption).
 *
 * Removed after Clerk migration (called non-existent endpoints):
 *   - registerUnverifiedUser  → /api/auth/register is gone
 *   - setResetToken           → Clerk owns password reset
 *
 * Updated after Clerk migration:
 *   - registerAndVerifyUser   → now a pure DB insert (no API call)
 */

import pg from "pg";
import crypto from "crypto";

const { Pool } = pg;

const DEFAULT_GYM_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Create a verified owner user with their own gym directly in the DB.
 * Replaces the old API-based registration helper; Clerk now owns the
 * registration flow so we can no longer call /api/auth/register.
 *
 * The `password` parameter is accepted for call-site compatibility but is
 * NOT stored — Clerk manages credentials and the local DB has no password hash
 * after the migration.
 */
export async function registerAndVerifyUser(
  email: string,
  _password: string,
  name: string,
  gymName: string = "Test Gym",
): Promise<{ gymId: string }> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Create a gym for this owner
    const slug =
      gymName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) +
      "-" +
      crypto.randomBytes(4).toString("hex");

    const { rows: gymRows } = await pool.query(
      `INSERT INTO gyms (name, slug) VALUES ($1, $2) RETURNING id`,
      [gymName, slug],
    );
    const gymId = gymRows[0].id as string;

    const [firstName, ...rest] = name.split(" ");
    const lastName = rest.join(" ") || null;

    // Fetch gymId for the existing user if there's a conflict, otherwise use
    // the newly-created gym.  Tests always use unique UIDs so conflicts are rare.
    const { rows: userRows } = await pool.query(
      `INSERT INTO users (email, name, first_name, last_name, role, gym_id, email_verified)
       VALUES ($1, $2, $3, $4, 'owner', $5, true)
       ON CONFLICT (email) DO UPDATE
         SET name           = EXCLUDED.name,
             first_name     = EXCLUDED.first_name,
             last_name      = EXCLUDED.last_name,
             role           = EXCLUDED.role,
             gym_id         = EXCLUDED.gym_id,
             email_verified = true
       RETURNING gym_id`,
      [email.toLowerCase().trim(), name, firstName, lastName, gymId],
    );

    return { gymId: userRows[0].gym_id as string };
  } finally {
    await pool.end();
  }
}

/**
 * Remove a test user and their sessions. Does NOT delete the gym — use
 * deleteGymAndAllUsers to clean up the owner + gym in one shot.
 */
export async function deleteTestUserByEmail(email: string): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      "SELECT gym_id, role FROM users WHERE email = $1",
      [email.toLowerCase().trim()],
    );
    const gymId = rows[0]?.gym_id;
    const role = rows[0]?.role;

    await pool.query(
      "DELETE FROM sessions WHERE (sess->>'user')::jsonb->>'email' = $1",
      [email.toLowerCase().trim()],
    );
    await pool.query("DELETE FROM users WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);

    // Only delete the gym when deleting an owner and it's not the shared default
    if (role === "owner" && gymId && gymId !== DEFAULT_GYM_ID) {
      // Delete dependent rows first
      await pool.query(
        "DELETE FROM invites WHERE gym_id = $1",
        [gymId],
      );
      await pool.query("DELETE FROM gyms WHERE id = $1", [gymId]);
    }
  } finally {
    await pool.end();
  }
}

/**
 * Insert a test invite directly into the DB (bypasses email delivery).
 * Returns the gymId of the owner's gym.
 */
export async function createTestInvite(
  ownerEmail: string,
  inviteeEmail: string,
  token: string,
  expiresInMs: number = 48 * 60 * 60 * 1000,
): Promise<string> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      "SELECT id, gym_id FROM users WHERE email = $1",
      [ownerEmail.toLowerCase().trim()],
    );
    const owner = rows[0];
    if (!owner) throw new Error(`createTestInvite: owner not found: ${ownerEmail}`);

    const expiresAt = new Date(Date.now() + expiresInMs);

    await pool.query(
      `INSERT INTO invites (gym_id, email, token, expires_at, invited_by_user_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [owner.gym_id, inviteeEmail.toLowerCase().trim(), token, expiresAt.toISOString(), owner.id],
    );

    return owner.gym_id as string;
  } finally {
    await pool.end();
  }
}

/**
 * Insert (or reset) a user row with a pending verify token.
 * emailVerified is forced to false.  Useful for testing the verify-email flow
 * without going through the full registration API.
 */
export async function insertUnverifiedUserWithToken(
  email: string,
  token: string,
  expiresInMs: number = 24 * 60 * 60 * 1000,
): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const expiresAt = new Date(Date.now() + expiresInMs);
    await pool.query(
      `INSERT INTO users (email, email_verified, verify_token, verify_token_expiry, role)
       VALUES ($1, false, $2, $3, 'staff')
       ON CONFLICT (email) DO UPDATE
         SET email_verified      = false,
             verify_token        = $2,
             verify_token_expiry = $3`,
      [email.toLowerCase().trim(), token, expiresAt.toISOString()],
    );
  } finally {
    await pool.end();
  }
}

/**
 * Delete a gym and ALL associated data (invites, users, sessions) by owner email.
 * Use this for full invite-test cleanup.
 */
export async function deleteGymAndAllUsers(ownerEmail: string): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(
      "SELECT gym_id FROM users WHERE email = $1",
      [ownerEmail.toLowerCase().trim()],
    );
    const gymId = rows[0]?.gym_id;
    if (!gymId || gymId === DEFAULT_GYM_ID) return;

    // Sessions for all users in this gym
    await pool.query(
      `DELETE FROM sessions WHERE (sess->'user'->>'gymId') = $1`,
      [gymId],
    );

    // Invites
    await pool.query("DELETE FROM invites WHERE gym_id = $1", [gymId]);

    // Outbound messages → lead sequences → leads → sequence templates → users
    await pool.query(
      `DELETE FROM outbound_messages
       WHERE lead_id IN (SELECT id FROM leads WHERE gym_id = $1)`,
      [gymId],
    );
    await pool.query(
      `DELETE FROM lead_sequences
       WHERE lead_id IN (SELECT id FROM leads WHERE gym_id = $1)`,
      [gymId],
    );
    await pool.query("DELETE FROM leads WHERE gym_id = $1", [gymId]);
    await pool.query("DELETE FROM sequence_templates WHERE gym_id = $1", [gymId]);
    await pool.query("DELETE FROM users WHERE gym_id = $1", [gymId]);
    await pool.query("DELETE FROM gyms WHERE id = $1", [gymId]);
  } finally {
    await pool.end();
  }
}
