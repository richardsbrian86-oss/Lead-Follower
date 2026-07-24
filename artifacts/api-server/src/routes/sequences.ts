import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, leadSequencesTable, sequenceTemplatesTable, leadsTable } from "@workspace/db";
import {
  GetLeadSequenceParams,
  GetLeadSequenceResponse,
  PauseLeadSequenceParams,
  PauseLeadSequenceResponse,
  ResumeLeadSequenceParams,
  ResumeLeadSequenceResponse,
  CancelLeadSequenceParams,
  CancelLeadSequenceResponse,
  ListSequenceTemplatesResponse,
  UpdateSequenceTemplateParams,
  UpdateSequenceTemplateBody,
  UpdateSequenceTemplateResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

type DbSeq = typeof leadSequencesTable.$inferSelect;
type DbTemplate = typeof sequenceTemplatesTable.$inferSelect;

function serializeSeq(seq: DbSeq) {
  return {
    ...seq,
    nextSendAt: seq.nextSendAt instanceof Date ? seq.nextSendAt.toISOString() : seq.nextSendAt,
    createdAt: seq.createdAt instanceof Date ? seq.createdAt.toISOString() : seq.createdAt,
    updatedAt: seq.updatedAt instanceof Date ? seq.updatedAt.toISOString() : seq.updatedAt,
  };
}

function serializeTemplate(t: DbTemplate) {
  return {
    ...t,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
    updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : t.updatedAt,
  };
}

async function requireLeadOwnership(leadId: number, gymId: string): Promise<boolean> {
  const [lead] = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.gymId, gymId)));
  return lead != null;
}

router.get("/leads/:id/sequence", async (req, res): Promise<void> => {
  const params = GetLeadSequenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const gymId = req.user!.gymId!;
  if (!(await requireLeadOwnership(params.data.id, gymId))) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const [seq] = await db
    .select()
    .from(leadSequencesTable)
    .where(eq(leadSequencesTable.leadId, params.data.id));

  if (!seq) {
    res.status(404).json({ error: "Sequence not found for this lead" });
    return;
  }

  res.json(GetLeadSequenceResponse.parse(serializeSeq(seq)));
});

router.post("/leads/:id/sequence/pause", async (req, res): Promise<void> => {
  const params = PauseLeadSequenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const gymId = req.user!.gymId!;
  if (!(await requireLeadOwnership(params.data.id, gymId))) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const [seq] = await db
    .select()
    .from(leadSequencesTable)
    .where(eq(leadSequencesTable.leadId, params.data.id));

  if (!seq) {
    res.status(404).json({ error: "Sequence not found for this lead" });
    return;
  }

  const [updated] = await db
    .update(leadSequencesTable)
    .set({ paused: true, updatedAt: new Date() })
    .where(eq(leadSequencesTable.id, seq.id))
    .returning();

  res.json(PauseLeadSequenceResponse.parse(serializeSeq(updated)));
});

router.post("/leads/:id/sequence/resume", async (req, res): Promise<void> => {
  const params = ResumeLeadSequenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const gymId = req.user!.gymId!;
  if (!(await requireLeadOwnership(params.data.id, gymId))) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const [seq] = await db
    .select()
    .from(leadSequencesTable)
    .where(eq(leadSequencesTable.leadId, params.data.id));

  if (!seq) {
    res.status(404).json({ error: "Sequence not found for this lead" });
    return;
  }

  const [updated] = await db
    .update(leadSequencesTable)
    .set({ paused: false, updatedAt: new Date() })
    .where(eq(leadSequencesTable.id, seq.id))
    .returning();

  res.json(ResumeLeadSequenceResponse.parse(serializeSeq(updated)));
});

router.post("/leads/:id/sequence/cancel", async (req, res): Promise<void> => {
  const params = CancelLeadSequenceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const gymId = req.user!.gymId!;
  if (!(await requireLeadOwnership(params.data.id, gymId))) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const [seq] = await db
    .select()
    .from(leadSequencesTable)
    .where(eq(leadSequencesTable.leadId, params.data.id));

  if (!seq) {
    res.status(404).json({ error: "Sequence not found for this lead" });
    return;
  }

  const [updated] = await db
    .update(leadSequencesTable)
    .set({ cancelled: true, nextSendAt: null, updatedAt: new Date() })
    .where(eq(leadSequencesTable.id, seq.id))
    .returning();

  res.json(CancelLeadSequenceResponse.parse(serializeSeq(updated)));
});

// Templates are scoped per gym — each gym has its own customizable sequence templates.
router.get("/sequences/templates", async (req, res): Promise<void> => {
  const gymId = req.user!.gymId!;
  const templates = await db
    .select()
    .from(sequenceTemplatesTable)
    .where(eq(sequenceTemplatesTable.gymId, gymId))
    .orderBy(sequenceTemplatesTable.step);
  res.json(ListSequenceTemplatesResponse.parse(templates.map(serializeTemplate)));
});

router.put("/sequences/templates/:step", async (req, res): Promise<void> => {
  const params = UpdateSequenceTemplateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateSequenceTemplateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const gymId = req.user!.gymId!;
  const [existing] = await db
    .select()
    .from(sequenceTemplatesTable)
    .where(
      and(
        eq(sequenceTemplatesTable.step, params.data.step),
        eq(sequenceTemplatesTable.gymId, gymId),
      ),
    );

  if (!existing) {
    res.status(404).json({ error: "Template not found for your gym" });
    return;
  }

  const updateData: Partial<typeof sequenceTemplatesTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.data.delayDays !== undefined) updateData.delayDays = body.data.delayDays;
  if (body.data.toneInstruction !== undefined) updateData.toneInstruction = body.data.toneInstruction;

  const [updated] = await db
    .update(sequenceTemplatesTable)
    .set(updateData)
    .where(
      and(
        eq(sequenceTemplatesTable.step, params.data.step),
        eq(sequenceTemplatesTable.gymId, gymId),
      ),
    )
    .returning();

  res.json(UpdateSequenceTemplateResponse.parse(serializeTemplate(updated)));
});

export default router;
