import { type Request, type Response, type NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, isNull, gt } from "drizzle-orm";
import { db, usersTable, invitesTable, gymsTable } from "@workspace/db";
import type { User } from "@workspace/db";
import { sendInviteAcceptedEmail } from "../lib/email";

declare global {
  namespace Express {
    interface Request {
      dbUser?: User;
    }
  }
}

/**
 * Require a valid Clerk session.
 *
 * Bridge: email. Looks up the local users row by sessionClaims.email.
 * On first sign-in (no row found): JIT-provisions a new row. If there is a
 * pending invite for that email the user is assigned to that gym automatically.
 *
 * Dev bypass: when NODE_ENV !== "production" and no Clerk session is present,
 * falls back to the first user in the seeded gym so the app works without
 * signing in during local development.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const email = auth?.sessionClaims?.email as string | undefined;

  if (!email) {
    // Dev bypass: auto-inject the first owner user when not in production
    if (process.env.NODE_ENV !== "production") {
      try {
        const [owner] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.gymId, "00000000-0000-0000-0000-000000000001"))
          .limit(1);
        if (owner) {
          req.dbUser = { ...owner, role: "owner" };
          next();
          return;
        }
      } catch {
        // ignore — fall through to 401
      }
    }
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Email bridge: look up existing local user by email
  let [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!dbUser) {
    // JIT provisioning: check for a pending invite to assign the gym
    const [invite] = await db
      .select()
      .from(invitesTable)
      .where(
        and(
          eq(invitesTable.email, email),
          isNull(invitesTable.acceptedAt),
          gt(invitesTable.expiresAt, new Date()),
        ),
      )
      .limit(1);

    const [inserted] = await db
      .insert(usersTable)
      .values({
        email,
        role: "staff",
        gymId: invite?.gymId ?? null,
        emailVerified: true,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      dbUser = inserted;
      if (invite) {
        await db
          .update(invitesTable)
          .set({ acceptedAt: new Date() })
          .where(eq(invitesTable.id, invite.id));

        // Fire-and-forget: notify the gym owner
        void (async () => {
          try {
            const [owner, gym] = await Promise.all([
              db
                .select({ email: usersTable.email })
                .from(usersTable)
                .where(and(eq(usersTable.gymId, invite.gymId), eq(usersTable.role, "owner")))
                .limit(1)
                .then((rows) => rows[0]),
              db
                .select({ name: gymsTable.name })
                .from(gymsTable)
                .where(eq(gymsTable.id, invite.gymId))
                .limit(1)
                .then((rows) => rows[0]),
            ]);
            if (owner?.email) {
              await sendInviteAcceptedEmail(owner.email, email, gym?.name ?? "your gym");
            }
          } catch (err) {
            console.error("[invite-accepted] failed to send owner notification:", err);
          }
        })();
      }
    } else {
      // Race condition: another concurrent request inserted first
      [dbUser] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email))
        .limit(1);
    }
  }

  if (!dbUser) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.dbUser = dbUser;
  next();
}

export function requireRole(role: "owner" | "staff") {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.dbUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (req.dbUser.role !== role) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
