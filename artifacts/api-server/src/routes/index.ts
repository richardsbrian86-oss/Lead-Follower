import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";
import messagingRouter from "./messaging";
import sequencesRouter from "./sequences";
import analyticsRouter from "./analytics";
import anthropicRouter from "./anthropic/index";
import authRouter from "./auth";

const router: IRouter = Router();

// ─── Intentionally public routes (no session required) ───────────────────────
//
//   GET  /healthz                        — liveness probe; must stay public
//   GET  /auth/user                      — lets the SPA check auth state before
//                                          deciding whether to show the login gate;
//                                          returns { user: null } when unauthenticated
//   GET  /login                          — starts the browser OIDC redirect flow
//   GET  /callback                       — receives the OIDC authorization code
//   GET  /logout                         — clears the session cookie, then redirects
//                                          to the OIDC provider's end-session URL
//   POST /mobile-auth/token-exchange     — exchanges a mobile PKCE code for a session
//                                          token; must be public because the client has
//                                          no session yet
//   POST /mobile-auth/logout             — deletes a mobile session token; accepts an
//                                          Authorization: Bearer header from a client
//                                          that may already be partially logged out
//
// Every other /api/* route is protected by requireAuth below.
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

router.use(requireAuth as (req: Request, res: Response, next: NextFunction) => void);

router.use(leadsRouter);
router.use(messagingRouter);
router.use(sequencesRouter);
router.use(analyticsRouter);
router.use(anthropicRouter);

export default router;
