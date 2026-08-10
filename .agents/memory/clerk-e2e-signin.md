---
name: Clerk E2E browser sign-in that actually works
description: How to establish a real signed-in Clerk browser session in Playwright in this Replit dev env (sign-in tokens + ticket strategy), and what does NOT work.
---

## The working recipe
1. Create a real dev-instance Clerk user via Backend API `POST https://api.clerk.com/v1/users` with `{email_address:[..], password, skip_password_checks:true}` (email domain must be plausible — `@test.example` is rejected, `@example.com` is accepted).
2. Mint a sign-in token: `POST /v1/sign_in_tokens {user_id}`.
3. In the Playwright page (after `window.Clerk.loaded`): `Clerk.client.signIn.create({strategy:'ticket', ticket})` then `Clerk.setActive({session: createdSessionId})`.
4. Wait for `/api/me` → 200 (also triggers server JIT provisioning).

See `e2e/helpers/session.ts` (`createTestUser` / `signInAsUser` / `deleteTestUser`).

## What does NOT work
- Password sign-in through the `<SignIn/>` UI in automation: blocked by Clerk "client trust" new-device email verification (`/sign-in/client-trust` asking for an emailed code).
- Token/session injection from outside the browser (earlier finding — see clerk-migration.md).

**Why:** device verification only applies to first-factor password flows; ticket-strategy sign-ins bypass it, and the dev-instance `__clerk_db_jwt` handshake works fine in headless Chromium.

**How to apply:** any E2E test needing a signed-in user should reuse `signInAsUser` rather than driving the sign-in form.
