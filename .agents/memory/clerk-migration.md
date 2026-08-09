---
name: Clerk migration — Flow State CRM
description: Key lessons from migrating this app from custom bcrypt/session auth to Replit-managed Clerk. Covers bridge strategy, JIT provisioning, Vite/Tailwind quirks, and testing limitations.
---

## Auth bridge strategy
- `users.id` is a random UUID (not a Replit or Clerk subject ID). Bridge is always **email**: `sessionClaims.email → WHERE users.email = ?`.
- Never use `auth.userId` (Clerk internal ID) for DB lookups — use email.

## JIT provisioning pattern
On first Clerk sign-in, if no local `users` row exists: insert one (role=staff, gymId=null). If a pending invite matches the email, auto-assign gymId and mark invite accepted. On conflict (race), re-select. See `requireAuth.ts`.

## New owner onboarding
New owners sign up via Clerk → `gymId = null` → frontend shows `GymSetupPage` → `POST /api/gyms` creates gym and assigns it. The old `/auth/register` route is gone.

## Correct Clerk v6.13.1 React components
- `Show` (from `@clerk/react`) is the conditional auth wrapper: `<Show when="signed-in">` / `<Show when="signed-out">`.
- `SignedIn` and `SignedOut` are **NOT exported** in this version — using them causes a Vite runtime crash.

## Tailwind v4 + Clerk
- Must add `@layer theme, base, clerk, components, utilities;` **before** `@import "tailwindcss"` in index.css.
- Vite plugin must use `tailwindcss({ optimize: false })` to prevent Clerk styles from breaking.

## Clerk testing limitation (dev)
- Testing agent's `signInClerkUser` creates a valid Clerk session token but it does not reflect in the React UI (`Show when="signed-in"` stays closed) in the Replit dev environment. This is because Clerk FAPI cookies don't work cross-origin without a proxy.
- `GET /api/me` from the testing agent browser always hits the dev bypass (returns seeded user) not the injected Clerk user.
- **Not a code bug** — the Clerk `Show` component works correctly; it's a dev-mode FAPI limitation. Use structural route/UI tests instead of session-injection tests for Clerk in this env.

## orval codegen — `schemas` option conflict
- The orval zod config previously had `schemas: { path: "generated/types", type: "typescript" }` which generated both Zod schemas (`api.ts`) and TypeScript type aliases (`types/`). Both exported the same names → TS2308 on `export *`.
- Fix: removed the `schemas` option from the orval zod config. Only `api.ts` is generated now.
- The index.ts re-export must be `export * from "./generated/api";` (single line) — orval regenerates it each run.

**Why:** TS2308 "has already exported a member" fires when two `export *` paths export the same name, even value vs type.

## Packages removed from server
- `cookie-parser`, `bcryptjs` — no longer needed after Clerk migration. `openid-client` was never installed (pre-existing).
