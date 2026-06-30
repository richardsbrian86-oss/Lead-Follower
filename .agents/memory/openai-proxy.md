---
name: OpenAI proxy model and JSON parsing
description: Replit AI Integrations proxy quirks — correct model name and how to handle JSON output
---

Use model `gpt-5-mini` (upgraded from `gpt-4o-mini`).

Do NOT set `response_format: { type: "json_object" }` — the proxy ignores it and may return markdown-fenced JSON.

**Why:** Project was upgraded to gpt-5-mini per task on 2026-06-30. The proxy doesn't support all OpenAI API parameters.

**How to apply:** Always extract JSON robustly — strip ```json ... ``` fences, then find the first `{` to last `}` as fallback. See `artifacts/api-server/src/lib/ai-generator.ts` `extractJson()` function.
