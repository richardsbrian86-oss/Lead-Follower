---
name: Twilio lazy initialization
description: Twilio SDK throws at instantiation time if SID is invalid — must be lazy
---

Never call `twilio(sid, token)` at module top-level, even inside a conditional check.

**Why:** Twilio validates that `accountSid` starts with "AC" at construction time and throws synchronously. If the env var has any other format (e.g. API key starting with SK), the whole module fails to load on startup.

**How to apply:** Wrap client creation in a function called only when actually needed (lazy factory pattern). See `artifacts/api-server/src/lib/messaging.ts` `getTwilioClient()`.
