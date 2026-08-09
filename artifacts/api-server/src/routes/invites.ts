import crypto from "crypto";
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, invitesTable, usersTable, gymsTable } from "@workspace/db";
import { eq, and, isNull, gt } from "drizzle-orm";
import { sendInviteEmail } from "../lib/email";

const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
const router: IRouter = Router();

function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (req.dbUser?.role !== "owner") {
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
    const gymId = req.dbUser!.gymId!;
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

// GET /api/invites — list pending and expired invites for the gym
router.get(
  "/invites",
  requireOwner as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const gymId = req.dbUser!.gymId!;
    const now = new Date();

    const allInvites = await db
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
        ),
      );

    const invites = allInvites.filter((inv) => new Date(inv.expiresAt) > now);
    const expiredInvites = allInvites.filter((inv) => new Date(inv.expiresAt) <= now);

    res.json({ invites, expiredInvites });
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

    const gymId = req.dbUser!.gymId!;
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

    // Get gym name for the invite email
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
      invitedByUserId: req.dbUser!.id,
    });

    try {
      await sendInviteEmail(
        normalizedEmail,
        gym?.name ?? "your gym",
        req.dbUser!.name ?? "The gym owner",
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
    const ownerGymId = req.dbUser!.gymId!;
    const ownerId = req.dbUser!.id;

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

    // Remove any invites sent by this user to avoid FK constraint violation on invitedByUserId.
    await db.delete(invitesTable).where(eq(invitesTable.invitedByUserId, userId as string));

    // Note: leads are scoped by gymId, not by userId, so no lead reassignment is needed.
    // All gym leads remain visible to the owner after staff removal.

    // Remove the user
    await db.delete(usersTable).where(eq(usersTable.id, userId));

    res.json({ message: "Staff member removed." });
  },
);

// POST /api/invites/resend/:token — invalidate old token, issue a fresh one and re-send email
router.post(
  "/invites/resend/:token",
  requireOwner as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const oldToken = req.params.token as string;
    const gymId = req.dbUser!.gymId!;

    const [invite] = await db
      .select({
        id: invitesTable.id,
        gymId: invitesTable.gymId,
        email: invitesTable.email,
        acceptedAt: invitesTable.acceptedAt,
      })
      .from(invitesTable)
      .where(eq(invitesTable.token, oldToken));

    if (!invite) {
      res.status(404).json({ error: "Invite not found." });
      return;
    }

    if (invite.gymId !== gymId) {
      res.status(403).json({ error: "You do not have permission to resend this invite." });
      return;
    }

    if (invite.acceptedAt) {
      res.status(409).json({ error: "This invite has already been accepted." });
      return;
    }

    // Get gym name for the email
    const [gym] = await db
      .select({ name: gymsTable.name })
      .from(gymsTable)
      .where(eq(gymsTable.id, gymId));

    // Generate a new token before touching the DB.
    // Send the email first — only swap tokens once delivery succeeds so the
    // invitee always has a usable link and the owner is never told "sent"
    // when no email was actually delivered.
    const newToken = generateToken();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    try {
      await sendInviteEmail(
        invite.email,
        gym?.name ?? "your gym",
        req.dbUser!.name ?? "The gym owner",
        newToken,
        getAppUrl(req),
      );
    } catch (err) {
      req.log?.warn({ err }, "Failed to send resend invite email; old invite preserved");
      res.status(502).json({ error: "Failed to send the invite email. The previous invite link is still valid." });
      return;
    }

    // Email delivered — atomically replace the old invite in a transaction.
    try {
      await db.transaction(async (tx) => {
        await tx.delete(invitesTable).where(eq(invitesTable.token, oldToken));
        await tx.insert(invitesTable).values({
          gymId,
          email: invite.email,
          token: newToken,
          expiresAt,
          invitedByUserId: req.dbUser!.id,
        });
      });
    } catch (err) {
      req.log?.error({ err }, "Failed to swap invite tokens after email delivery");
      res.status(500).json({ error: "Email was sent but we could not update the invite record. Please revoke the old invite and send a new one." });
      return;
    }

    res.json({ message: "Invite resent successfully." });
  },
);

// DELETE /api/invites/:token — revoke an invite (owner-only)
router.delete(
  "/invites/:token",
  requireOwner as (req: Request, res: Response, next: NextFunction) => void,
  async (req: Request, res: Response) => {
    const token = req.params.token as string;
    const gymId = req.dbUser!.gymId!;

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
