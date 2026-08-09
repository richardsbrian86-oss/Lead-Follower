import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, leadsTable, outboundMessagesTable } from "@workspace/db";
import {
  GetLeadMessagesParams,
  GetLeadMessagesResponse,
  DraftLeadMessageParams,
  DraftLeadMessageBody,
  DraftLeadMessageResponse,
  SendLeadMessageParams,
  SendLeadMessageBody,
  SendLeadMessageResponse,
} from "@workspace/api-zod";
import { generateMessage } from "../lib/ai-generator.js";
import { sendEmail, sendSms } from "../lib/messaging.js";
import { recomputeAndSaveScore } from "../lib/scorer.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

type DbMsg = typeof outboundMessagesTable.$inferSelect;

function serializeMessage(msg: DbMsg) {
  return {
    ...msg,
    sentAt: msg.sentAt instanceof Date ? msg.sentAt.toISOString() : msg.sentAt,
    createdAt: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
  };
}

router.get("/leads/:id/messages", async (req, res): Promise<void> => {
  const params = GetLeadMessagesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const gymId = req.dbUser!.gymId!;
  const [lead] = await db.select().from(leadsTable).where(
    and(eq(leadsTable.id, params.data.id), eq(leadsTable.gymId, gymId))
  );
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const msgs = await db
    .select()
    .from(outboundMessagesTable)
    .where(eq(outboundMessagesTable.leadId, params.data.id))
    .orderBy(desc(outboundMessagesTable.createdAt));

  res.json(GetLeadMessagesResponse.parse(msgs.map(serializeMessage)));
});

router.post("/leads/:id/messages/draft", async (req, res): Promise<void> => {
  const params = DraftLeadMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = DraftLeadMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const gymId = req.dbUser!.gymId!;
  const [lead] = await db.select().from(leadsTable).where(
    and(eq(leadsTable.id, params.data.id), eq(leadsTable.gymId, gymId))
  );
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const visitDateStr = new Date(lead.visitDate).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const draft = await generateMessage({
    leadName: lead.name,
    visitDate: visitDateStr,
    channel: body.data.channel,
    stepNumber: body.data.stepHint ?? 0,
    toneInstruction: "Warm and encouraging, remind them of the great experience they had, invite them to come back",
  });

  res.json(DraftLeadMessageResponse.parse({ ...draft, channel: body.data.channel }));
});

router.post("/leads/:id/messages/send", async (req, res): Promise<void> => {
  const params = SendLeadMessageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = SendLeadMessageBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const gymId = req.dbUser!.gymId!;
  const [lead] = await db.select().from(leadsTable).where(
    and(eq(leadsTable.id, params.data.id), eq(leadsTable.gymId, gymId))
  );
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const [msg] = await db
    .insert(outboundMessagesTable)
    .values({
      leadId: lead.id,
      gymId: lead.gymId,
      channel: body.data.channel,
      subject: body.data.subject ?? null,
      body: body.data.body,
      status: "pending",
      sequenceStep: body.data.sequenceStep ?? null,
    })
    .returning();

  if (body.data.channel === "email") {
    await sendEmail({
      messageId: msg.id,
      toEmail: lead.email,
      subject: body.data.subject ?? "Following up from Flow State",
      body: body.data.body,
    });
  } else {
    await sendSms({
      messageId: msg.id,
      toPhone: lead.phone,
      body: body.data.body,
    });
  }

  const [updated] = await db
    .select()
    .from(outboundMessagesTable)
    .where(eq(outboundMessagesTable.id, msg.id));

  await recomputeAndSaveScore(lead.id).catch((err) =>
    logger.error({ err, leadId: lead.id }, "Failed to recompute score after message send"),
  );

  res.status(201).json(SendLeadMessageResponse.parse(serializeMessage(updated)));
});

export default router;
