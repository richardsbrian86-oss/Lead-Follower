import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, invitesTable, usersTable, gymsTable, sessionsTable } from "@workspace/db";
import { eq, and, isNull, gt, sql } from "drizzle-orm";
import { generateToken } from "../lib/auth";
import { sendInviteEmail } from "../lib/email";

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

const router: IRouter = Router();

function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "owner") {
    res.status(403).json({ error: "Only gym owners can perform this action." });
    return;
  }
  next();
}

function getAppUrl(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

// GET /api/invites/members — list all users in the gym
router.get(
  "/invites/members",
  requireOwner as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const gymId = req.user!.gymId!;
    const members = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.gymId, gymId));

    res.json({ members });
  },
);

// GET /api/invites — list pending invites for the gym
router.get(
  "/invites",
  requireOwner as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const gymId = req.user!.gymId!;
    const now = new Date();

    const invites = await db
      .select({
        id: invitesTable.id,
        email: invitesTable.email,
        token: invitesTable.token,
        expiresAt: invitesTable.expiresAt,
        createdAt: invitesTable.createdAt,
        inviterName: usersTable.name,
      })
      .from(invitesTable)
      .leftJoin(usersTable, eq(invitesTable.invitedByUserId, usersTable.id))
      .where(
        and(
          eq(invitesTable.gymId, gymId),
          isNull(invitesTable.acceptedAt),
          gt(invitesTable.expiresAt, now),
        ),
      );

    res.json({ invites });
  },
);

// POST /api/invites — send an invite (owner-only)
router.post(
  "/invites",
  requireOwner as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const { email } = req.body ?? {};
    if (typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ error: "A valid email address is required." });
      return;
    }

    const gymId = req.user!.gymId!;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if the email already has an account in this gym
    const [existingUser] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.email, normalizedEmail), eq(usersTable.gymId, gymId)));

    if (existingUser) {
      res.status(409).json({ error: "This person already has an account in your gym." });
      return;
    }

    // Check for existing pending invite
    const [existingInvite] = await db
      .select({ id: invitesTable.id })
      .from(invitesTable)
      .where(
        and(
          eq(invitesTable.gymId, gymId),
          eq(invitesTable.email, normalizedEmail),
          isNull(invitesTable.acceptedAt),
          gt(invitesTable.expiresAt, new Date()),
        ),
      );

    if (existingInvite) {
      res.status(409).json({ error: "A pending invite already exists for this email." });
      return;
    }

    // Get gym name and inviter name
    const [gym] = await db
      .select({ name: gymsTable.name })
      .from(gymsTable)
      .where(eq(gymsTable.id, gymId));

    const token = generateToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    await db.insert(invitesTable).values({
      gymId,
      email: normalizedEmail,
      token,
      expiresAt,
      invitedByUserId: req.user!.id,
    });

    try {
      await sendInviteEmail(
        normalizedEmail,
        gym?.name ?? "your gym",
        req.user!.name ?? "The gym owner",
        token,
        getAppUrl(req),
      );
    } catch (err) {
      req.log?.warn({ err }, "Failed to send invite email");
    }

    res.status(201).json({ message: "Invite sent successfully." });
  },
);

// DELETE /api/team/members/:userId — remove a staff member (owner-only)
router.delete(
  "/team/members/:userId",
  requireOwner as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const userId = req.params.userId as string;
    const ownerGymId = req.user!.gymId!;
    const ownerId = req.user!.id;

    if (userId === ownerId) {
      res.status(400).json({ error: "You cannot remove yourself." });
      return;
    }

    const [target] = await db
      .select({ id: usersTable.id, gymId: usersTable.gymId, role: usersTable.role })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!target) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    if (target.gymId !== ownerGymId) {
      res.status(403).json({ error: "You do not have permission to remove this user." });
      return;
    }

    if (target.role === "owner") {
      res.status(400).json({ error: "Cannot remove an owner." });
      return;
    }

    // Invalidate all active sessions for the removed user
    await db
      .delete(sessionsTable)
      .where(sql`${sessionsTable.sess}->'user'->>'id' = ${userId}`);

    // Remove any invites sent by this user to avoid FK constraint violation on invitedByUserId.
    // Only owners can send invites, so this is a defensive cleanup for edge cases.
    await db.delete(invitesTable).where(eq(invitesTable.invitedByUserId, userId as string));

    // Note: leads are scoped by gymId, not by userId, so no lead reassignment is needed.
    // All gym leads remain visible to the owner after staff removal.

    // Remove the user
    await db.delete(usersTable).where(eq(usersTable.id, userId));

    res.json({ message: "Staff member removed." });
  },
);

// DELETE /api/invites/:token — revoke an invite (owner-only)
router.delete(
  "/invites/:token",
  requireOwner as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const token = req.params.token as string;
    const gymId = req.user!.gymId!;

    const [invite] = await db
      .select({ id: invitesTable.id, gymId: invitesTable.gymId })
      .from(invitesTable)
      .where(eq(invitesTable.token, token));

    if (!invite) {
      res.status(404).json({ error: "Invite not found." });
      return;
    }

    if (invite.gymId !== gymId) {
      res.status(403).json({ error: "You do not have permission to revoke this invite." });
      return;
    }

    await db.delete(invitesTable).where(eq(invitesTable.token, token));

    res.json({ message: "Invite revoked." });
  },
);

export default router;
