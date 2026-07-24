import { db, sequenceTemplatesTable, gymsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger.js";

const DEFAULT_GYM_ID = "00000000-0000-0000-0000-000000000001";

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
  // Ensure the default gym row exists before inserting templates that FK to it
  await db
    .insert(gymsTable)
    .values({ id: DEFAULT_GYM_ID, name: "Default Gym", slug: "default" })
    .onConflictDoNothing();

  for (const tmpl of DEFAULT_TEMPLATES) {
    const existing = await db
      .select()
      .from(sequenceTemplatesTable)
      .where(
        and(
          eq(sequenceTemplatesTable.gymId, DEFAULT_GYM_ID),
          eq(sequenceTemplatesTable.step, tmpl.step),
        ),
      );

    if (existing.length === 0) {
      await db.insert(sequenceTemplatesTable).values({ ...tmpl, gymId: DEFAULT_GYM_ID });
      logger.info({ step: tmpl.step, gymId: DEFAULT_GYM_ID }, "Seeded sequence template");
    }
  }
}
