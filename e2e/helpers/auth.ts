import pg from "pg";

const { Pool } = pg;

const BASE_URL = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : "http://localhost:3000";

const DEFAULT_GYM_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Register a user via the API, then flip email_verified=true and assign the
 * default gymId directly in the DB so tests can log in without touching email.
 * If the email already exists (409) we just verify it and move on.
 */
export async function registerAndVerifyUser(
  email: string,
  password: string,
  name: string,
  gymId: string = DEFAULT_GYM_ID,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
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
             verify_token_expiry = null,
             gym_id = $2
       WHERE email = $1`,
      [email.toLowerCase().trim(), gymId],
    );
  } finally {
    await pool.end();
  }
}

/**
 * Register an unverified user (no DB update — emailVerified stays false).
 * Assigns the default gymId so the user has a valid gym on their account.
 */
export async function registerUnverifiedUser(
  email: string,
  password: string,
  name: string,
  gymId: string = DEFAULT_GYM_ID,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, name }),
  });

  if (!res.ok && res.status !== 409) {
    throw new Error(
      `registerUnverifiedUser: register request failed ${res.status}: ${await res.text()}`,
    );
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(
      `UPDATE users SET gym_id = $2 WHERE email = $1 AND gym_id IS NULL`,
      [email.toLowerCase().trim(), gymId],
    );
  } finally {
    await pool.end();
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
 * Remove a test user and their sessions by email. Safe to call even if the
 * user does not exist.
 */
export async function deleteTestUserByEmail(email: string): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(
      "DELETE FROM sessions WHERE (sess->>'user')::jsonb->>'email' = $1",
      [email.toLowerCase().trim()],
    );
    await pool.query("DELETE FROM users WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);
  } finally {
    await pool.end();
  }
}
