import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import healthRouter from "./health";
import leadsRouter from "./leads";
import messagingRouter from "./messaging";
import sequencesRouter from "./sequences";
import analyticsRouter from "./analytics";
import anthropicRouter from "./anthropic/index";
import authRouter from "./auth";

const router: IRouter = Router();

// Auth routes are public (login, callback, logout, /auth/user)
router.use(authRouter);

// Health check is always public
router.use(healthRouter);

// All routes below require authentication
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
