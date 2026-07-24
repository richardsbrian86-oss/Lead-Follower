import pg from "pg";

const { Pool } = pg;

const BASE_URL = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : "http://localhost:3000";

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
 * Remove a test user, their sessions, and the gym they own.
 * Safe to call even if the user does not exist.
 */
export async function deleteTestUserByEmail(email: string): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    // Find the gym owned by this user before deleting the user
    const { rows } = await pool.query(
      "SELECT gym_id FROM users WHERE email = $1",
      [email.toLowerCase().trim()],
    );
    const gymId = rows[0]?.gym_id;

    await pool.query(
      "DELETE FROM sessions WHERE (sess->>'user')::jsonb->>'email' = $1",
      [email.toLowerCase().trim()],
    );
    await pool.query("DELETE FROM users WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);

    // Clean up the test gym (only if it's not the shared default gym)
    const DEFAULT_GYM_ID = "00000000-0000-0000-0000-000000000001";
    if (gymId && gymId !== DEFAULT_GYM_ID) {
      await pool.query("DELETE FROM gyms WHERE id = $1", [gymId]);
    }
  } finally {
    await pool.end();
  }
}
