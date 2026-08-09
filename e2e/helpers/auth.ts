import pg from "pg";

const { Pool } = pg;

const BASE_URL = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : "http://localhost:3000";

const DEFAULT_GYM_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Register a user via the API (creates gym + owner account), then flip
 * email_verified=true directly in the DB so tests can log in without email.
 * If the email already exists (409) we just verify it and move on.
 */
export async function registerAndVerifyUser(
  email: string,
  password: string,
  name: string,
  gymName: string = "Test Gym",
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, gymName }),
  });

  if (!res.ok && res.status !== 409) {
    throw new Error(
      `registerAndVerifyUser: register request failed ${res.status}: ${await res.text()}`,
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(
      `UPDATE users
         SET email_verified = true,
             verify_token   = null,
             verify_token_expiry = null
       WHERE email = $1`,
      [email.toLowerCase().trim()],
    );
  } finally {
    await pool.end();
  }
}

/**
 * Register an unverified user (no DB update — emailVerified stays false).
 * The registration endpoint assigns a gym and gymId automatically.
 */
export async function registerUnverifiedUser(
  email: string,
  password: string,
  name: string,
  gymName: string = "Test Gym",
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name, gymName }),
  });

  if (!res.ok && res.status !== 409) {
    throw new Error(
      `registerUnverifiedUser: register request failed ${res.status}: ${await res.text()}`,
    );
  }
}

/**
 * Create a verified user and inject a reset token with the given expiry.
 */
export async function setResetToken(
  email: string,
  resetToken: string,
  expiry: Date,
): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(
      `UPDATE users
         SET reset_token = $1, reset_token_expiry = $2
       WHERE email = $3`,
      [resetToken, expiry.toISOString(), email.toLowerCase().trim()],
    );
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
