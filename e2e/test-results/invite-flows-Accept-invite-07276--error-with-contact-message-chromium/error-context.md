# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: invite-flows.spec.ts >> Accept invite flow >> expired/invalid token — shows error with contact message
- Location: tests/invite-flows.spec.ts:68:3

# Error details

```
error: column "email_verified" of relation "users" does not exist
```

# Test source

```ts
  1   | /**
  2   |  * Auth test helpers — DB-level fixtures only.
  3   |  *
  4   |  * After the Clerk migration, registration/login/logout are handled by Clerk.
  5   |  * These helpers only perform direct DB operations for test fixture setup and
  6   |  * teardown, or for flows that are still owned by our API (e.g. email
  7   |  * verification, invite consumption).
  8   |  *
  9   |  * Removed after Clerk migration (called non-existent endpoints):
  10  |  *   - registerUnverifiedUser  → /api/auth/register is gone
  11  |  *   - setResetToken           → Clerk owns password reset
  12  |  *
  13  |  * Updated after Clerk migration:
  14  |  *   - registerAndVerifyUser   → now a pure DB insert (no API call)
  15  |  */
  16  | 
  17  | import pg from "pg";
  18  | import crypto from "crypto";
  19  | 
  20  | const { Pool } = pg;
  21  | 
  22  | const DEFAULT_GYM_ID = "00000000-0000-0000-0000-000000000001";
  23  | 
  24  | /**
  25  |  * Create a verified owner user with their own gym directly in the DB.
  26  |  * Replaces the old API-based registration helper; Clerk now owns the
  27  |  * registration flow so we can no longer call /api/auth/register.
  28  |  *
  29  |  * The `password` parameter is accepted for call-site compatibility but is
  30  |  * NOT stored — Clerk manages credentials and the local DB has no password hash
  31  |  * after the migration.
  32  |  */
  33  | export async function registerAndVerifyUser(
  34  |   email: string,
  35  |   _password: string,
  36  |   name: string,
  37  |   gymName: string = "Test Gym",
  38  | ): Promise<{ gymId: string }> {
  39  |   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  40  |   try {
  41  |     // Create a gym for this owner
  42  |     const slug =
  43  |       gymName
  44  |         .toLowerCase()
  45  |         .replace(/[^a-z0-9]+/g, "-")
  46  |         .replace(/^-+|-+$/g, "")
  47  |         .slice(0, 40) +
  48  |       "-" +
  49  |       crypto.randomBytes(4).toString("hex");
  50  | 
  51  |     const { rows: gymRows } = await pool.query(
  52  |       `INSERT INTO gyms (name, slug) VALUES ($1, $2) RETURNING id`,
  53  |       [gymName, slug],
  54  |     );
  55  |     const gymId = gymRows[0].id as string;
  56  | 
  57  |     const [firstName, ...rest] = name.split(" ");
  58  |     const lastName = rest.join(" ") || null;
  59  | 
  60  |     // Fetch gymId for the existing user if there's a conflict, otherwise use
  61  |     // the newly-created gym.  Tests always use unique UIDs so conflicts are rare.
> 62  |     const { rows: userRows } = await pool.query(
      |                                ^ error: column "email_verified" of relation "users" does not exist
  63  |       `INSERT INTO users (email, name, first_name, last_name, role, gym_id, email_verified)
  64  |        VALUES ($1, $2, $3, $4, 'owner', $5, true)
  65  |        ON CONFLICT (email) DO UPDATE
  66  |          SET name           = EXCLUDED.name,
  67  |              first_name     = EXCLUDED.first_name,
  68  |              last_name      = EXCLUDED.last_name,
  69  |              role           = EXCLUDED.role,
  70  |              gym_id         = EXCLUDED.gym_id,
  71  |              email_verified = true
  72  |        RETURNING gym_id`,
  73  |       [email.toLowerCase().trim(), name, firstName, lastName, gymId],
  74  |     );
  75  | 
  76  |     return { gymId: userRows[0].gym_id as string };
  77  |   } finally {
  78  |     await pool.end();
  79  |   }
  80  | }
  81  | 
  82  | /**
  83  |  * Remove a test user and their sessions. Does NOT delete the gym — use
  84  |  * deleteGymAndAllUsers to clean up the owner + gym in one shot.
  85  |  */
  86  | export async function deleteTestUserByEmail(email: string): Promise<void> {
  87  |   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  88  |   try {
  89  |     const { rows } = await pool.query(
  90  |       "SELECT gym_id, role FROM users WHERE email = $1",
  91  |       [email.toLowerCase().trim()],
  92  |     );
  93  |     const gymId = rows[0]?.gym_id;
  94  |     const role = rows[0]?.role;
  95  | 
  96  |     await pool.query(
  97  |       "DELETE FROM sessions WHERE (sess->>'user')::jsonb->>'email' = $1",
  98  |       [email.toLowerCase().trim()],
  99  |     );
  100 |     await pool.query("DELETE FROM users WHERE email = $1", [
  101 |       email.toLowerCase().trim(),
  102 |     ]);
  103 | 
  104 |     // Only delete the gym when deleting an owner and it's not the shared default
  105 |     if (role === "owner" && gymId && gymId !== DEFAULT_GYM_ID) {
  106 |       // Delete dependent rows first
  107 |       await pool.query(
  108 |         "DELETE FROM invites WHERE gym_id = $1",
  109 |         [gymId],
  110 |       );
  111 |       await pool.query("DELETE FROM gyms WHERE id = $1", [gymId]);
  112 |     }
  113 |   } finally {
  114 |     await pool.end();
  115 |   }
  116 | }
  117 | 
  118 | /**
  119 |  * Insert a test invite directly into the DB (bypasses email delivery).
  120 |  * Returns the gymId of the owner's gym.
  121 |  */
  122 | export async function createTestInvite(
  123 |   ownerEmail: string,
  124 |   inviteeEmail: string,
  125 |   token: string,
  126 |   expiresInMs: number = 48 * 60 * 60 * 1000,
  127 | ): Promise<string> {
  128 |   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  129 |   try {
  130 |     const { rows } = await pool.query(
  131 |       "SELECT id, gym_id FROM users WHERE email = $1",
  132 |       [ownerEmail.toLowerCase().trim()],
  133 |     );
  134 |     const owner = rows[0];
  135 |     if (!owner) throw new Error(`createTestInvite: owner not found: ${ownerEmail}`);
  136 | 
  137 |     const expiresAt = new Date(Date.now() + expiresInMs);
  138 | 
  139 |     await pool.query(
  140 |       `INSERT INTO invites (gym_id, email, token, expires_at, invited_by_user_id)
  141 |        VALUES ($1, $2, $3, $4, $5)`,
  142 |       [owner.gym_id, inviteeEmail.toLowerCase().trim(), token, expiresAt.toISOString(), owner.id],
  143 |     );
  144 | 
  145 |     return owner.gym_id as string;
  146 |   } finally {
  147 |     await pool.end();
  148 |   }
  149 | }
  150 | 
  151 | /**
  152 |  * Insert (or reset) a user row with a pending verify token.
  153 |  * emailVerified is forced to false.  Useful for testing the verify-email flow
  154 |  * without going through the full registration API.
  155 |  */
  156 | export async function insertUnverifiedUserWithToken(
  157 |   email: string,
  158 |   token: string,
  159 |   expiresInMs: number = 24 * 60 * 60 * 1000,
  160 | ): Promise<void> {
  161 |   const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  162 |   try {
```