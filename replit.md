# Flow State CRM

A Gym Lead CRM for tracking leads, managing staff, and running automated follow-up sequences. Gym owners manage their pipeline from a web dashboard; staff can also act on leads via a mobile app.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port $PORT)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Auth: Clerk (email/password; migrated from Replit Auth)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Web: React + Vite + Tailwind v4 + Wouter
- Mobile: Expo (SDK 54) + Expo Router

## Authentication

Authentication uses **Clerk** (Replit-managed). Session cookies are used on web; bearer tokens on mobile.

- Bridge: **email** — Clerk session `sessionClaims.email` → `WHERE users.email = ?` in the local DB.
- JIT provisioning: on first login, a new `users` row is created. If a pending invite exists for that email, `gymId` is auto-assigned.
- New owners: sign up via Clerk, then visit `/setup-gym` to name and create their gym.
- Invited staff: visit their invite link, see gym info, then sign up via Clerk. JIT assigns their gym automatically.
- Key env vars: `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`

## Where things live

- DB schema: `lib/db/src/schema/`
- API spec (source of truth for API contract): `lib/api-spec/openapi.yaml`
- Generated API client (don't edit directly): `lib/api-client-react/src/`
- Server routes: `artifacts/api-server/src/routes/`
- Server auth middleware: `artifacts/api-server/src/middlewares/requireAuth.ts`
- Web app: `artifacts/gym-leads/src/`
- Mobile app: `artifacts/gym-mobile/app/`

## Architecture decisions

- **Email bridge**: users.id is a random UUID (not a Replit/Clerk ID), so we bridge by email. `sessionClaims.email` is always the lookup key for the local users table.
- **Clerk proxy**: all Clerk API traffic is proxied through `/api/__clerk` on the Express server in production (handled by `clerkProxyMiddleware`).
- **No req.user**: the old `req.user` / `req.isAuthenticated()` pattern is gone. Use `req.dbUser` (set by `requireAuth` middleware) throughout route handlers.
- **Web = cookies, mobile = bearer tokens**: web uses Clerk session cookies; the Expo mobile app uses `setAuthTokenGetter(() => getToken())` to attach bearer tokens.
- **Invites are email-based**: an invite is a pending DB row for an email. When the invitee signs up with Clerk and first hits a protected endpoint, JIT provisioning matches the email, assigns the gym, and marks the invite accepted.

## Product

Flow State CRM lets gym owners add leads (walk-ins, referrals, online inquiries), run automated outreach sequences (SMS/email), track staff performance, and view analytics on conversion rates and follow-up activity. Staff members can view and act on an action queue of the day's highest-priority leads.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- When modifying the OpenAPI spec, always re-run `pnpm --filter @workspace/api-spec run codegen` after.
- `pnpm --filter @workspace/db run push` must be run after any schema change.
- Tailwind v4: the Clerk CSS layer (`@layer theme, base, clerk, components, utilities;`) must be declared before `@import "tailwindcss"` in `index.css`. The `tailwindcss` vite plugin must use `{ optimize: false }` to prevent Clerk UI from breaking in prod builds.
- Never pass `sessionClaims.userId` to Clerk API methods — it's the legacy local DB ID, not a Clerk user ID. Use `auth.userId` for Clerk API calls only.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `.local/skills/clerk-auth/` for Clerk integration details
