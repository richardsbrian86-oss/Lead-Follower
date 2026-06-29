import { db, sequenceTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

const DEFAULT_TEMPLATES = [
  {
    step: 0,
    delayDays: 1,
    toneInstruction: "Warm welcome follow-up. Remind them how great the visit was, highlight one benefit (community, equipment, classes). Invite them to sign up with a low-pressure CTA.",
  },
  {
    step: 1,
    delayDays: 3,
    toneInstruction: "Friendly check-in. Address a common hesitation (cost, commitment). Mention any current promotion or flexible membership options. Keep it brief.",
  },
  {
    step: 2,
    delayDays: 7,
    toneInstruction: "Value-focused nudge. Share a compelling reason to join now — a member success story angle or seasonal benefit. Offer a free trial class as a next step.",
  },
  {
    step: 3,
    delayDays: 14,
    toneInstruction: "Final check-in before closing the loop. Express genuine care for their fitness goals. Let them know the door is always open. No pressure, just warmth.",
  },
];

export async function seedSequenceTemplates(): Promise<void> {
  for (const tmpl of DEFAULT_TEMPLATES) {
    const existing = await db
      .select()
      .from(sequenceTemplatesTable)
      .where(eq(sequenceTemplatesTable.step, tmpl.step));

    if (existing.length === 0) {
      await db.insert(sequenceTemplatesTable).values(tmpl);
      logger.info({ step: tmpl.step }, "Seeded sequence template");
    }
  }
}
