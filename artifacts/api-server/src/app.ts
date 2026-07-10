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

// General rate limit — 200 req / 15 min per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req: Request, res: Response) {
    res.status(429).json({ error: "Too many requests, please try again later." });
  },
});

// Strict rate limit for AI/send endpoints — 10 req / 15 min per IP
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req: Request, res: Response) {
    res.status(429).json({ error: "Rate limit exceeded for this action." });
  },
});

app.use("/api", generalLimiter);
app.use("/api/leads/:id/messages/draft", strictLimiter);
app.use("/api/leads/:id/messages/send", strictLimiter);
app.use("/api/analytics/insights", strictLimiter);
app.use("/api/anthropic/conversations/:id/messages", strictLimiter);

// Populate req.user from session cookie / bearer token
app.use(authMiddleware as (req: Request, res: Response, next: NextFunction) => void);

app.use("/api", router);

// Seed default sequence templates and start cron scheduler
seedSequenceTemplates().then(() => startScheduler()).catch((err: unknown) => {
  logger.error({ err }, "Failed to start scheduler");
});

export default app;
