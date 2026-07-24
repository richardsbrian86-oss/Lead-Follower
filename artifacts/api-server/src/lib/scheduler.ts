import cron from "node-cron";
import { db, leadSequencesTable, sequenceTemplatesTable, leadsTable, outboundMessagesTable } from "@workspace/db";
import { eq, and, lte, isNotNull, notInArray } from "drizzle-orm";
import { generateMessage } from "./ai-generator.js";
import { sendEmail, sendSms } from "./messaging.js";
import { recomputeAllActiveScores } from "./scorer.js";
import { logger } from "./logger.js";

const MAX_STEPS = 4;

export function startScheduler(): void {
  // Run every hour at the top of the hour
  cron.schedule("0 * * * *", async () => {
    logger.info("Sequence scheduler tick");
    await processSequences();
    await recomputeAllActiveScores().catch((err) => logger.error({ err }, "Score recompute failed"));
  });

  // Also run once at startup after a short delay (5s)
  setTimeout(async () => {
    logger.info("Sequence scheduler startup run");
    await recomputeAllActiveScores().catch((err) => logger.error({ err }, "Startup score recompute failed"));
    await processSequences();
  }, 5000);
}

async function processSequences(): Promise<void> {
  const now = new Date();

  const dueSequences = await db
    .select({
      seq: leadSequencesTable,
      lead: leadsTable,
    })
    .from(leadSequencesTable)
    .innerJoin(leadsTable, eq(leadSequencesTable.leadId, leadsTable.id))
    .where(
      and(
        eq(leadSequencesTable.paused, false),
        eq(leadSequencesTable.cancelled, false),
        isNotNull(leadSequencesTable.nextSendAt),
        lte(leadSequencesTable.nextSendAt, now),
        notInArray(leadsTable.status, ["won", "lost"]),
      ),
    );

  logger.info({ count: dueSequences.length }, "Due sequences found");

  for (const { seq, lead } of dueSequences) {
    if (seq.currentStep >= MAX_STEPS) {
      await db
        .update(leadSequencesTable)
        .set({ cancelled: true, nextSendAt: null })
        .where(eq(leadSequencesTable.id, seq.id));
      continue;
    }

    const gymId = lead.gymId ?? null;

    const templates = await db
      .select()
      .from(sequenceTemplatesTable)
      .where(
        and(
          eq(sequenceTemplatesTable.step, seq.currentStep),
          gymId ? eq(sequenceTemplatesTable.gymId, gymId) : undefined,
        ),
      );

    const template = templates[0];
    if (!template) {
      logger.warn({ step: seq.currentStep, gymId }, "No template found for step");
      continue;
    }

    try {
      const nextStep = seq.currentStep + 1;
      const nextSendAt = nextStep < MAX_STEPS
        ? await getNextSendAt(nextStep, lead.visitDate, gymId)
        : null;

      // Generate and send email
      const emailDraft = await generateMessage({
        leadName: lead.name,
        visitDate: new Date(lead.visitDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        channel: "email",
        stepNumber: seq.currentStep,
        toneInstruction: template.toneInstruction,
      });

      const [emailMsg] = await db
        .insert(outboundMessagesTable)
        .values({
          leadId: lead.id,
          gymId,
          channel: "email",
          subject: emailDraft.subject,
          body: emailDraft.body,
          status: "pending",
          sequenceStep: seq.currentStep,
        })
        .returning();

      await sendEmail({
        messageId: emailMsg.id,
        toEmail: lead.email,
        subject: emailDraft.subject ?? "Following up from Flow State",
        body: emailDraft.body,
      });

      // Generate and send SMS
      const smsDraft = await generateMessage({
        leadName: lead.name,
        visitDate: new Date(lead.visitDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        channel: "sms",
        stepNumber: seq.currentStep,
        toneInstruction: template.toneInstruction,
      });

      const [smsMsg] = await db
        .insert(outboundMessagesTable)
        .values({
          leadId: lead.id,
          gymId,
          channel: "sms",
          subject: null,
          body: smsDraft.body,
          status: "pending",
          sequenceStep: seq.currentStep,
        })
        .returning();

      await sendSms({
        messageId: smsMsg.id,
        toPhone: lead.phone,
        body: smsDraft.body,
      });

      await db
        .update(leadSequencesTable)
        .set({
          currentStep: nextStep,
          nextSendAt,
          updatedAt: new Date(),
        })
        .where(eq(leadSequencesTable.id, seq.id));

      logger.info({ leadId: lead.id, step: seq.currentStep }, "Sequence step sent");
    } catch (err) {
      logger.error({ err, leadId: lead.id, step: seq.currentStep }, "Error processing sequence step");
    }
  }
}

async function getNextSendAt(step: number, visitDate: Date, gymId: string | null): Promise<Date | null> {
  const conditions = [eq(sequenceTemplatesTable.step, step)];
  if (gymId) conditions.push(eq(sequenceTemplatesTable.gymId, gymId));

  const templates = await db
    .select()
    .from(sequenceTemplatesTable)
    .where(and(...conditions));

  const template = templates[0];
  if (!template) return null;

  const base = new Date(visitDate);
  base.setDate(base.getDate() + template.delayDays);
  return base;
}

export async function createSequenceForLead(leadId: number, visitDate: Date, gymId?: string | null): Promise<void> {
  const conditions = [eq(sequenceTemplatesTable.step, 0)];
  if (gymId) conditions.push(eq(sequenceTemplatesTable.gymId, gymId));

  const templates = await db
    .select()
    .from(sequenceTemplatesTable)
    .where(and(...conditions));

  const firstTemplate = templates[0];
  if (!firstTemplate) return;

  const nextSendAt = new Date(visitDate);
  nextSendAt.setDate(nextSendAt.getDate() + firstTemplate.delayDays);

  await db
    .insert(leadSequencesTable)
    .values({
      leadId,
      gymId: gymId ?? null,
      currentStep: 0,
      paused: false,
      cancelled: false,
      nextSendAt,
    })
    .onConflictDoNothing();
}
