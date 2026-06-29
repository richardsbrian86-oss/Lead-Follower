---
name: Lead Scoring — outreach engagement factor
description: Correct formula for the outreach engagement scoring factor in scorer.ts
---

The outreach engagement factor (0–15 pts) must:
- Filter to sequence messages only: `isNotNull(outboundMessagesTable.sequenceStep)`
- Denominator = sent + failed (resolved messages only; `pending` excluded as unresolved)
- Numerator = sent
- Formula: `Math.round((sent / (sent + failed)) * 15)`
- Return 0 if no resolved sequence messages exist

**Why:** Manual messages and pending messages are not valid signals of outreach success. Using all messages + pending denominator produces incorrect engagement ratios.

**How to apply:** Any change to outreach scoring must maintain these three filters. File: `artifacts/api-server/src/lib/scorer.ts`.
