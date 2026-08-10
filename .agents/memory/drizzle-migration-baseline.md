---
name: Drizzle migration baselining + config gotcha
description: How to bring an untracked/drifted dev schema under drizzle-kit migration history without touching prod, and a drizzle-kit 0.31.10 config bug that blocks a second `generate` run.
---

## Baselining an untracked schema (dev DB only)
When the migration journal doesn't cover the dev DB's actual current schema (e.g. earlier changes were applied via `push` instead of tracked migrations), don't hand-write a migration to "catch up" blindly:
1. Run `drizzle-kit generate` against the current schema.ts — with no prior snapshots to diff against it emits a full-schema migration.
2. Compute `sha256` hex digest of the raw generated `.sql` file content (this is exactly what `drizzle-orm/migrator.js` uses as the hash).
3. Insert one row into `drizzle.__drizzle_migrations` with that hash and the journal entry's `when` timestamp — this marks the migration "applied" without running its SQL (safe only because the dev DB already has that exact state).
4. Now future `drizzle-kit generate` calls diff against a clean baseline and only emit the real incremental changes.

**Why:** production schema sync on Replit goes through the Publish-flow's own dev↔prod diff, completely independent of the Drizzin journal — so this baselining only needs to satisfy the dev DB and the journal, never a custom production migration script (writing one is explicitly out of bounds).

## drizzle-kit 0.31.10 bug: absolute `out` path breaks re-`generate`
If `drizzle.config.ts` sets `out: path.join(__dirname, "./migrations")` (absolute), the **first** `generate` call succeeds, but any **later** `generate` call crashes with `ENOENT ..././/home/...` (malformed doubled path).
**Why:** `validateWithReport` in drizzle-kit's bin reads existing snapshots via `` `./${it}` `` string concatenation, assuming `it` (built from `out`) is relative — an absolute `out` produces a broken path.
**How to apply:** keep `out` as a plain relative string (e.g. `"./migrations"`), not `path.join(__dirname, ...)`. Only safe when the script is always invoked with cwd = the package directory (true for `pnpm --filter <pkg> run generate/migrate`).

## tsc false positives after editing a shared package's exports
After deleting/renaming exports in a workspace package (e.g. dropping a Drizzle table from `@workspace/db`), stale `tsconfig.tsbuildinfo` incremental-build caches in dependent packages can produce misleading cascading errors (e.g. "no exported member" for names you never touched). Delete the `.tsbuildinfo` files for the edited package and its consumers before trusting `tsc --noEmit` output.
