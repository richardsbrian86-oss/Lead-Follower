import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { GetCurrentAuthUserResponse } from "@workspace/api-zod";
import { db, usersTable, gymsTable, invitesTable } from "@workspace/db";
import { eq, and, isNull, gt } from "drizzle-orm";
import {
  clearSession,
  getSessionId,
  createSession,
  SESSION_COOKIE,
  SESSION_TTL,
  generateToken,
  type SessionData,
} from "../lib/auth";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
} from "../lib/email";

const BCRYPT_ROUNDS = 12;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

const router: IRouter = Router();

function getAppUrl(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: Response, sid: string) {
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function buildUserPayload(user: {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  gymId: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    gymId: user.gymId ?? null,
    firstName: user.firstName,
    lastName: user.lastName,
    profileImageUrl: user.profileImageUrl,
  };
}

function createGymSlug(gymName: string): string {
  const base = gymName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = crypto.randomBytes(4).toString("hex");
  return base ? `${base}-${suffix}` : suffix;
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.post("/auth/register", async (req: Request, res: Response) => {
  const { email, password, name, gymName } = req.body ?? {};
  if (
    typeof email !== "string" ||
    !email.includes("@") ||
    typeof password !== "string" ||
    password.length < 8 ||
    typeof name !== "string" ||
    !name.trim() ||
    typeof gymName !== "string" ||
    !gymName.trim()
  ) {
    res.status(400).json({
      error:
        "Your name, gym name, a valid email, and a password of at least 8 characters are required.",
    });
    return;
  }

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (existing.length > 0) {
    res.status(409).json({ error: "An account with that email already exists." });
    return;
  }

  // Create the gym first
  const [gym] = await db
    .insert(gymsTable)
    .values({
      name: gymName.trim(),
      slug: createGymSlug(gymName.trim()),
    })
    .returning();

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const verifyToken = generateToken();
  const verifyTokenExpiry = new Date(Date.now() + VERIFY_TTL_MS);

  const [user] = await db
    .insert(usersTable)
    .values({
      email: email.toLowerCase().trim(),
      name: name.trim(),
      firstName: name.trim().split(" ")[0] ?? null,
      lastName: name.trim().split(" ").slice(1).join(" ") || null,
      passwordHash,
      emailVerified: false,
      verifyToken,
      verifyTokenExpiry,
      role: "owner",
      gymId: gym.id,
    })
    .returning();

  try {
    await sendVerificationEmail(user.email!, user.name!, verifyToken, getAppUrl(req));
  } catch (err) {
    req.log?.warn({ err }, "Failed to send verification email");
  }

  res.status(201).json({ message: "Account created. Please check your email to verify your account." });
});

router.post("/auth/resend-verification", async (req: Request, res: Response) => {
  const { email } = req.body ?? {};
  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (user && !user.emailVerified) {
    const verifyToken = generateToken();
    const verifyTokenExpiry = new Date(Date.now() + VERIFY_TTL_MS);
    await db
      .update(usersTable)
      .set({ verifyToken, verifyTokenExpiry })
      .where(eq(usersTable.id, user.id));
    try {
      await sendVerificationEmail(user.email!, user.name!, verifyToken, getAppUrl(req));
    } catch (err) {
      req.log?.warn({ err }, "Failed to resend verification email");
    }
  }

  res.json({ message: "If your email is registered and unverified, a new verification link is on its way." });
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user || !user.passwordHash) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  if (!user.emailVerified) {
    res.status(403).json({
      error: "Please verify your email before signing in. Check your inbox for the verification link.",
      code: "EMAIL_NOT_VERIFIED",
    });
    return;
  }

  const sessionData: SessionData = {
    user: buildUserPayload(user),
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);

  res.json({ user: buildUserPayload(user), token: sid });
});

router.get("/auth/verify-email", async (req: Request, res: Response) => {
  const { token } = req.query;
  const appUrl = getAppUrl(req);

  if (typeof token !== "string") {
    res.redirect(`${appUrl}/?verifyError=1`);
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.verifyToken, token));

  if (!user || !user.verifyTokenExpiry || user.verifyTokenExpiry < new Date()) {
    res.redirect(`${appUrl}/?verifyError=1`);
    return;
  }

  await db
    .update(usersTable)
    .set({ emailVerified: true, verifyToken: null, verifyTokenExpiry: null })
    .where(eq(usersTable.id, user.id));

  res.redirect(`${appUrl}/?verified=1`);
});

// GET /auth/invite/:token — public: validate invite token, return gym name + email
router.get("/auth/invite/:token", async (req: Request, res: Response) => {
  const { token } = req.params;

  const [invite] = await db
    .select({
      email: invitesTable.email,
      expiresAt: invitesTable.expiresAt,
      acceptedAt: invitesTable.acceptedAt,
      gymId: invitesTable.gymId,
    })
    .from(invitesTable)
    .where(eq(invitesTable.token, token));

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    res.status(404).json({ error: "This invite link is invalid or has expired." });
    return;
  }

  const [gym] = await db
    .select({ name: gymsTable.name })
    .from(gymsTable)
    .where(eq(gymsTable.id, invite.gymId));

  res.json({ email: invite.email, gymName: gym?.name ?? "your gym" });
});

// POST /auth/accept-invite — public: create staff account from invite, auto-login
router.post("/auth/accept-invite", async (req: Request, res: Response) => {
  const { token, name, password } = req.body ?? {};
  if (
    typeof token !== "string" ||
    typeof name !== "string" ||
    !name.trim() ||
    typeof password !== "string" ||
    password.length < 8
  ) {
    res.status(400).json({
      error: "A valid token, your name, and a password of at least 8 characters are required.",
    });
    return;
  }

  const [invite] = await db
    .select()
    .from(invitesTable)
    .where(eq(invitesTable.token, token));

  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    res.status(400).json({ error: "This invite link is invalid or has expired. Contact your gym owner for a new invite." });
    return;
  }

  // Check if the email already has an account
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, invite.email));

  if (existing) {
    res.status(409).json({ error: "An account with this email already exists. Try signing in instead." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const trimmedName = name.trim();

  const [user] = await db
    .insert(usersTable)
    .values({
      email: invite.email,
      name: trimmedName,
      firstName: trimmedName.split(" ")[0] ?? null,
      lastName: trimmedName.split(" ").slice(1).join(" ") || null,
      passwordHash,
      emailVerified: true,
      role: "staff",
      gymId: invite.gymId,
    })
    .returning();

  // Mark invite as accepted
  await db
    .update(invitesTable)
    .set({ acceptedAt: new Date() })
    .where(eq(invitesTable.token, token));

  // Create session (auto-login)
  const sessionData: SessionData = { user: buildUserPayload(user) };
  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);

  res.status(201).json({ user: buildUserPayload(user) });
});

router.post("/auth/forgot-password", async (req: Request, res: Response) => {
  const { email } = req.body ?? {};
  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase().trim()));

  if (user && user.emailVerified) {
    const resetToken = generateToken();
    const resetTokenExpiry = new Date(Date.now() + RESET_TTL_MS);
    await db
      .update(usersTable)
      .set({ resetToken, resetTokenExpiry })
      .where(eq(usersTable.id, user.id));
    try {
      await sendPasswordResetEmail(user.email!, resetToken, getAppUrl(req));
    } catch (err) {
      req.log?.warn({ err }, "Failed to send password reset email");
    }
  }

  res.json({ message: "If an account exists with that email, you'll receive a reset link shortly." });
});

router.post("/auth/reset-password", async (req: Request, res: Response) => {
  const { token, password } = req.body ?? {};
  if (typeof token !== "string" || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "A valid token and a password of at least 8 characters are required." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.resetToken, token));

  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await db
    .update(usersTable)
    .set({ passwordHash, resetToken: null, resetTokenExpiry: null })
    .where(eq(usersTable.id, user.id));

  res.json({ message: "Password updated successfully. You can now sign in." });
});

router.get("/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  await clearSession(res, sid);
  res.json({ success: true });
});

export default router;
