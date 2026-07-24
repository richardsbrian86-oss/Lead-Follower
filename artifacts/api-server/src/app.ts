import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import { startScheduler } from "./lib/scheduler";
import { seedSequenceTemplates } from "./lib/seed-templates";

const app: Express = express();

// Trust the first hop proxy so req.ip resolves to the real client IP.
// express-rate-limit reads req.ip; without this all traffic appears to come
// from the same proxy address and limits become effectively global.
app.set("trust proxy", 1);

// Security headers first
app.use(helmet());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Paths (relative to /api) that are exempt from the general rate limiter.
// Auth endpoints have their own dedicated limiter (authLimiter below) and must
// not share the general budget — if other test suites consume that budget,
// auth routes would start returning 429, breaking auth e2e tests.
// The health probe is a liveness check and must always be reachable.
function isExemptFromGeneralLimit(req: Request): boolean {
  return req.path.startsWith("/auth/") || req.path === "/logout" || req.path === "/healthz";
}

// General rate limit — 200 req / 15 min per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isExemptFromGeneralLimit,
  handler(_req: Request, res: Response) {
    res.status(429).json({ error: "Too many requests, please try again later." });
  },
});

// Auth limiter — protects sensitive credential endpoints from brute-force and
// credential-stuffing attacks.  100 req / 15 min per IP allows automated e2e
// test suites to run while still blocking realistic brute-force abuse.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req: Request, res: Response) {
    res.status(429).json({ error: "Too many requests, please try again later." });
  },
});

// Draft limiter — permissive, no external cost (just AI text generation)
// 50 drafts per 15 min is generous for any real user workflow
const draftLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req: Request, res: Response) {
    res.status(429).json({ error: "Draft rate limit reached. Please slow down." });
  },
});

// Send/action limiter — strict because these fire real emails/SMS (external cost)
const sendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req: Request, res: Response) {
    res.status(429).json({ error: "Send rate limit reached. Please wait before sending more messages." });
  },
});

// AI chat limiter — moderate; each message costs API credits
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req: Request, res: Response) {
    res.status(429).json({ error: "AI chat rate limit reached. Please wait before sending more messages." });
  },
});

app.use("/api", generalLimiter);
// Auth endpoints have their own dedicated limiter (excluded from generalLimiter above)
app.use([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/accept-invite",
  "/api/auth/resend-verification",
], authLimiter);
app.use("/api/leads/:id/messages/draft", draftLimiter);
app.use("/api/leads/:id/messages/send", sendLimiter);
app.use("/api/analytics/insights", sendLimiter);
app.use("/api/anthropic/conversations/:id/messages", chatLimiter);

// Populate req.user from session cookie / bearer token
app.use(authMiddleware as (req: Request, res: Response, next: NextFunction) => void);

app.use("/api", router);

// Seed default sequence templates and start cron scheduler
seedSequenceTemplates().then(() => startScheduler()).catch((err: unknown) => {
  logger.error({ err }, "Failed to start scheduler");
});

export default app;
