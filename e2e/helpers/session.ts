import pg from "pg";
import crypto from "crypto";

const { Pool } = pg;

const DEFAULT_GYM_ID = "00000000-0000-0000-0000-000000000001";

export interface TestUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  gymId?: string;
}

export async function createTestUser(user: TestUser, role: string = "staff"): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(
      `INSERT INTO users (id, email, first_name, last_name, gym_id, role)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         gym_id = EXCLUDED.gym_id,
         role = EXCLUDED.role`,
      [user.id, user.email, user.firstName, user.lastName, user.gymId ?? DEFAULT_GYM_ID, role],
    );
  } finally {
    await pool.end();
  }
}

export async function createTestSession(user: TestUser, role: string = "staff"): Promise<string> {
  await createTestUser(user, role);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const sid = crypto.randomBytes(32).toString("hex");
    const gymId = user.gymId ?? DEFAULT_GYM_ID;
    const sess = {
      user: {
        id: user.id,
        email: user.email,
        name: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
        role,
        gymId,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: null,
      },
    };
    const expire = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      "INSERT INTO sessions (sid, sess, expire) VALUES ($1, $2::jsonb, $3)",
      [sid, JSON.stringify(sess), expire.toISOString()],
    );

    return sid;
  } finally {
    await pool.end();
  }
}

export async function deleteTestSession(sid: string): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query("DELETE FROM sessions WHERE sid = $1", [sid]);
  } finally {
    await pool.end();
  }
}

export async function sessionExists(sid: string): Promise<boolean> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await pool.query(
      "SELECT 1 FROM sessions WHERE sid = $1 AND expire > NOW()",
      [sid],
    );
    return result.rowCount === 1;
  } finally {
    await pool.end();
  }
}
