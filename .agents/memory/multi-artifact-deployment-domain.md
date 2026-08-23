---
name: Multi-artifact deployment domain
description: How production domains work for a pnpm-workspace project with multiple artifacts (web + api + mobile, etc.) — relevant when wiring cross-artifact URLs, CORS, webhooks, or universal/app links.
---

In this project's pnpm-workspace setup, multiple artifacts (e.g. a `web` frontend at previewPath `/` and an `api` service at previewPath `/api`) are **not** separate deployments with separate domains. `getDeploymentInfo()` returns exactly one `primaryUrl` for the whole project — the artifacts share that single production domain and are split internally by path prefix (see each artifact's `.replit-artifact/artifact.toml` `paths`).

**Why this matters:** anything that needs a "stable domain" for one artifact (e.g. building a link in an email sent by the API server that should point at the web frontend, or hosting `.well-known` verification files that must live at the domain root) can use the one shared `primaryUrl` — there's no need to guess which artifact's URL is "the real one" or to provision a domain per artifact.

**How to apply:** call `getDeploymentInfo()` to get the actual production URL before assuming a project isn't deployed yet or fabricating a domain. Root-level static assets (like Apple's `apple-app-site-association` or Android's `assetlinks.json`) belong in whichever artifact owns previewPath `/` (typically the web frontend's `public/` dir), since that's what serves the domain root.
