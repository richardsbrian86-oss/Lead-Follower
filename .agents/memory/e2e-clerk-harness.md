---
name: E2E testing of auth-gated UI via dev-only harness routes
description: How to e2e-test components behind the Clerk sign-in gate in the Replit dev env, and how to trigger TanStack Query focus refetches in Playwright.
---

## Pattern
Clerk browser sessions can't be established in dev e2e (FAPI cross-origin limitation), so components behind `Show when="signed-in"` are unreachable at their real routes. Instead, register a dev-only harness route in the web app (`{import.meta.env.DEV && <Route path="/__e2e/<name>" ... />}`) that renders the component directly inside the existing providers, then drive its network states with Playwright `page.route` mocks.

**Why:** Session-injection tests fail silently in this env (see clerk-migration.md); harness routes give real-browser coverage without auth, and `import.meta.env.DEV` guarantees exclusion from production builds.

**How to apply:** Any time a Playwright test needs an auth-gated component's UI states. First harness: `/__e2e/action-queue` in the gym-leads app.

## Triggering a focus refetch in Playwright
TanStack Query v5's focusManager listens for `visibilitychange` on **window**. Dispatching the event on `document` (non-bubbling) does nothing. Use `window.dispatchEvent(new Event("visibilitychange"))` after waiting past the query's `staleTime`.
