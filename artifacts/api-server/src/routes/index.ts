import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";
import messagingRouter from "./messaging";
import sequencesRouter from "./sequences";
import analyticsRouter from "./analytics";
import anthropicRouter from "./anthropic/index";
import authRouter from "./auth";
import invitesRouter from "./invites";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

// ─── Intentionally public routes (no session required) ───────────────────────
//
//   GET  /healthz                        — liveness probe; must stay public
//   GET  /auth/invite/:token             — validates invite link (public)
//
// Auth-gated but no gym required:
//   GET  /me                             — current user info (uses inline requireAuth)
//   POST /gyms                           — create gym during owner onboarding
//
// Every other /api/* route requires a valid Clerk session AND an assigned gym.
// ─────────────────────────────────────────────────────────────────────────────
router.use(healthRouter);
router.use(authRouter);

// All business routes require a valid Clerk session ───────────────────────────
router.use(requireAuth as (req: Request, res: Response, next: NextFunction) => void);

// All business routes require a gym — protects against users who just signed
// up and haven't been assigned to a gym yet.
function requireGym(req: Request, res: Response, next: NextFunction) {
  if (!req.dbUser?.gymId) {
    res.status(403).json({ error: "No gym assigned to your account. Contact your administrator." });
    return;
  }
  next();
}

router.use(requireGym as (req: Request, res: Response, next: NextFunction) => void);

router.use(leadsRouter);
router.use(messagingRouter);
router.use(sequencesRouter);
router.use(analyticsRouter);
router.use(anthropicRouter);
router.use(invitesRouter);

export default router;
