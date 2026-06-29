---
name: OpenAI proxy model and JSON parsing
description: Replit AI Integrations proxy quirks — correct model name and how to handle JSON output
---

Use model `gpt-4o-mini` (not `gpt-5-mini` or `gpt-4-mini`).

Do NOT set `response_format: { type: "json_object" }` — the proxy ignores it and may return markdown-fenced JSON.

**Why:** The proxy maps to gpt-4o-mini-2024-07-18 and doesn't support all OpenAI API parameters.

**How to apply:** Always extract JSON robustly — strip ```json ... ``` fences, then find the first `{` to last `}` as fallback. See `artifacts/api-server/src/lib/ai-generator.ts` `extractJson()` function.
