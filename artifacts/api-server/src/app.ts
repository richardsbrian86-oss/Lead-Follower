import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";
import { seedSequenceTemplates } from "./lib/seed-templates";

const app: Express = express();

// Trust the first hop proxy so req.ip resolves to the real client IP.
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

// Clerk proxy must be mounted before body parsers (it streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Paths (relative to /api) that are exempt from the general rate limiter.
function isExemptFromGeneralLimit(req: Request): boolean {
  return req.path.startsWith("/auth/") || req.path === "/healthz";
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

// Auth limiter — protects invite/onboarding endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req: Request, res: Response) {
    res.status(429).json({ error: "Too many requests, please try again later." });
  },
});

const draftLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req: Request, res: Response) {
    res.status(429).json({ error: "Draft rate limit reached. Please slow down." });
  },
});

const sendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req: Request, res: Response) {
    res.status(429).json({ error: "Send rate limit reached. Please wait before sending more messages." });
  },
});

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
app.use("/api/gyms", authLimiter);
app.use("/api/leads/:id/messages/draft", draftLimiter);
app.use("/api/leads/:id/messages/send", sendLimiter);
app.use("/api/analytics/insights", sendLimiter);
app.use("/api/anthropic/conversations/:id/messages", chatLimiter);

// Clerk middleware — resolves session from cookie, validates JWT.
// Must come after the proxy middleware but before route handlers.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

// Seed default sequence templates and start cron scheduler
seedSequenceTemplates().then(() => startScheduler()).catch((err: unknown) => {
  logger.error({ err }, "Failed to start scheduler");
});

export default app;
