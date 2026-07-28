import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import healthRouter from "./health";
import leadsRouter from "./leads";
import messagingRouter from "./messaging";
import sequencesRouter from "./sequences";
import analyticsRouter from "./analytics";
import anthropicRouter from "./anthropic/index";
import authRouter from "./auth";
import invitesRouter from "./invites";

const router: IRouter = Router();

// ─── Intentionally public routes (no session required) ───────────────────────
//
//   GET  /healthz                        — liveness probe; must stay public
//   GET  /auth/user                      — lets the SPA check auth state before
//                                          deciding whether to show the login gate;
//                                          returns { user: null } when unauthenticated
//   POST /auth/register                  — creates a new account (email + password)
//   POST /auth/login                     — validates credentials, issues session
//   GET  /auth/verify-email              — confirms email via token link (redirects)
//   POST /auth/forgot-password           — sends password reset email
//   POST /auth/reset-password            — sets a new password via reset token
//   GET  /logout                         — clears the session cookie, returns JSON
//
// Every other /api/* route is protected by requireAuth + requireGym below.
// ─────────────────────────────────────────────────────────────────────────────
router.use(healthRouter);
router.use(authRouter);

// All business routes require a valid session ─────────────────────────────────
function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// All business routes require a gym — protects against users who registered but
// haven't been assigned to a gym yet (e.g. during owner onboarding flow).
function requireGym(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.gymId) {
    res.status(403).json({ error: "No gym assigned to your account. Contact your administrator." });
    return;
  }
  next();
}

// DEV BYPASS: auto-inject the first owner user so API calls work without a session.
// Remove this block (and the db/eq imports above) before deploying to live gyms.
if (process.env.NODE_ENV !== "production") {
  router.use(async (req: Request, _res: Response, next: NextFunction) => {
    if (req.isAuthenticated()) { next(); return; }
    try {
      const [owner] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.gymId, "00000000-0000-0000-0000-000000000001"))
        .limit(1);
      if (owner) {
        req.user = {
          id: owner.id,
          email: owner.email ?? null,
          name: owner.name ?? null,
          role: owner.role as "owner" | "staff",
          gymId: owner.gymId ?? undefined,
          firstName: owner.firstName ?? null,
          lastName: owner.lastName ?? null,
          profileImageUrl: owner.profileImageUrl ?? null,
        };
      }
    } catch { /* ignore */ }
    next();
  });
}

router.use(requireAuth as (req: Request, res: Response, next: NextFunction) => void);
router.use(requireGym as (req: Request, res: Response, next: NextFunction) => void);

router.use(leadsRouter);
router.use(messagingRouter);
router.use(sequencesRouter);
router.use(analyticsRouter);
router.use(anthropicRouter);
router.use(invitesRouter);

export default router;
