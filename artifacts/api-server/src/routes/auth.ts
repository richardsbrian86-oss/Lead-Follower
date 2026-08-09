import crypto from "crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, usersTable, gymsTable, invitesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

// Resolve the frontend origin for redirects.
// In the Replit proxy environment both the API (/api/*) and the frontend (/)
// share the same public hostname, so a root-relative redirect works.
function frontendUrl(req: Request, path: string): string {
  // path must start with "/"
  const proto = req.get("x-forwarded-proto") ?? req.protocol;
  const host = req.get("x-forwarded-host") ?? req.get("host") ?? "localhost";
  return `${proto}://${host}${path}`;
}

const router: IRouter = Router();

function createGymSlug(gymName: string): string {
  const base = gymName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = crypto.randomBytes(4).toString("hex");
  return base ? `${base}-${suffix}` : suffix;
}

// GET /me — returns the current user's local DB record (gymId, role, etc.)
// Protected by requireAuth; does NOT require a gym (used for onboarding check).
router.get(
  "/me",
  requireAuth as (req: Request, res: Response, next: NextFunction) => void,
  (req: Request, res: Response) => {
    const u = req.dbUser!;
    res.json({
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        gymId: u.gymId ?? null,
        firstName: u.firstName,
        lastName: u.lastName,
        profileImageUrl: u.profileImageUrl,
      },
    });
  },
);

// POST /gyms — create a gym and assign it to the current user (owner onboarding)
// Protected by requireAuth; does NOT require a gym.
router.post(
  "/gyms",
  requireAuth as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const { gymName } = req.body ?? {};
    if (typeof gymName !== "string" || !gymName.trim()) {
      res.status(400).json({ error: "Gym name is required." });
      return;
    }

    const user = req.dbUser!;

    if (user.gymId) {
      res.status(409).json({ error: "You already belong to a gym." });
      return;
    }

    const [gym] = await db
      .insert(gymsTable)
      .values({
        name: gymName.trim(),
        slug: createGymSlug(gymName.trim()),
      })
      .returning();

    await db
      .update(usersTable)
      .set({ gymId: gym.id, role: "owner" })
      .where(eq(usersTable.id, user.id));

    res.status(201).json({ gym: { id: gym.id, name: gym.name } });
  },
);

// POST /auth/consume-invite — authenticated: claim a pending invite for an
// existing user who has no gym yet.  Handles the case where the invitee already
// had a Clerk/local account before being invited.
router.post(
  "/auth/consume-invite",
  requireAuth as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const { token } = req.body ?? {};
    if (typeof token !== "string" || !token) {
      res.status(400).json({ error: "Invite token is required." });
      return;
    }

    const user = req.dbUser!;

    if (user.gymId) {
      // Already in a gym — idempotent success (invite may already be accepted)
      res.json({ gymId: user.gymId });
      return;
    }

    const [invite] = await db
      .select()
      .from(invitesTable)
      .where(eq(invitesTable.token, token))
      .limit(1);

    if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
      res.status(404).json({ error: "This invite link is invalid or has expired." });
      return;
    }

    // Security: verify the invite email matches the authenticated user's email
    if (invite.email.toLowerCase() !== (user.email ?? "").toLowerCase()) {
      res.status(403).json({ error: "This invite was sent to a different email address." });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(usersTable)
        .set({ gymId: invite.gymId, role: "staff" })
        .where(eq(usersTable.id, user.id));
      await tx
        .update(invitesTable)
        .set({ acceptedAt: new Date() })
        .where(eq(invitesTable.id, invite.id));
    });

    res.json({ gymId: invite.gymId });
  },
);

// GET /auth/verify-email — public: activate an account via a one-time token
// sent in the verification email.  Always redirects (never JSON) so that
// clicking the link in an email client works without any JS.
router.get("/auth/verify-email", async (req: Request, res: Response) => {
  const token = typeof req.query.token === "string" ? req.query.token.trim() : "";

  const invalidUrl = frontendUrl(req, "/?verified=invalid");

  if (!token) {
    res.redirect(invalidUrl);
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.verifyToken, token))
    .limit(1);

  if (!user || !user.verifyTokenExpiry || user.verifyTokenExpiry < new Date()) {
    res.redirect(invalidUrl);
    return;
  }

  await db
    .update(usersTable)
    .set({
      emailVerified: true,
      verifyToken: null,
      verifyTokenExpiry: null,
    })
    .where(eq(usersTable.id, user.id));

  res.redirect(frontendUrl(req, "/?verified=true"));
});

// GET /auth/invite/:token — public: validate invite token, return gym name + email
router.get("/auth/invite/:token", async (req: Request, res: Response) => {
  const token = req.params.token as string;

  const [invite] = await db
    .select({
      email: invitesTable.email,
      expiresAt: invitesTable.expiresAt,
      acceptedAt: invitesTable.acceptedAt,
      gymId: invitesTable.gymId,
    })
    .from(invitesTable)
    .where(eq(invitesTable.token, token));

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    res.status(404).json({ error: "This invite link is invalid or has expired." });
    return;
  }

  const [gym] = await db
    .select({ name: gymsTable.name })
    .from(gymsTable)
    .where(eq(gymsTable.id, invite.gymId));

  res.json({ email: invite.email, gymName: gym?.name ?? "your gym" });
});

export default router;
