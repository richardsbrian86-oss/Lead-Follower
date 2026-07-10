import { Router, type IRouter } from "express";
import { eq, ilike, or, and, desc, count, sql, notInArray } from "drizzle-orm";
import { db, leadsTable, leadEventsTable, leadSequencesTable } from "@workspace/db";
import { createSequenceForLead } from "../lib/scheduler.js";
import { recomputeAndSaveScore, computeScore } from "../lib/scorer.js";
import { logger } from "../lib/logger.js";
import {
  ListLeadsQueryParams,
  ListLeadsResponse,
  CreateLeadBody,
  CreateLeadResponse,
  GetLeadParams,
  GetLeadResponse,
  UpdateLeadParams,
  UpdateLeadBody,
  UpdateLeadResponse,
  DeleteLeadParams,
  CreateLeadEventParams,
  CreateLeadEventBody,
  CreateLeadEventResponse,
  GetDashboardSummaryResponse,
  GetLeadScoreParams,
  GetLeadScoreResponse,
  GetDashboardActionQueueResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

type DbLead = typeof leadsTable.$inferSelect;
type DbEvent = typeof leadEventsTable.$inferSelect;

function serializeLead(lead: DbLead) {
  return {
    ...lead,
    visitDate: lead.visitDate instanceof Date ? lead.visitDate.toISOString() : lead.visitDate,
    createdAt: lead.createdAt instanceof Date ? lead.createdAt.toISOString() : lead.createdAt,
    updatedAt: lead.updatedAt instanceof Date ? lead.updatedAt.toISOString() : lead.updatedAt,
  };
}

function serializeEvent(event: DbEvent) {
  return {
    ...event,
    createdAt: event.createdAt instanceof Date ? event.createdAt.toISOString() : event.createdAt,
  };
}

router.get("/leads", async (req, res): Promise<void> => {
  const query = ListLeadsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { status, search } = query.data;

  const conditions = [];
  if (status) {
    conditions.push(eq(leadsTable.status, status));
  }
  if (search) {
    conditions.push(
      or(
        ilike(leadsTable.name, `%${search}%`),
        ilike(leadsTable.email, `%${search}%`),
      ),
    );
  }

  const leads = await db
    .select()
    .from(leadsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(leadsTable.createdAt));

  res.json(ListLeadsResponse.parse(leads.map(serializeLead)));
});

router.post("/leads", async (req, res): Promise<void> => {
  const parsed = CreateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { visitDate, ...rest } = parsed.data;
  const [lead] = await db
    .insert(leadsTable)
    .values({ ...rest, visitDate: new Date(visitDate) })
    .returning();

  await db.insert(leadEventsTable).values({
    leadId: lead.id,
    type: "created",
    note: "Lead added to system",
  });

  // Start automated follow-up sequence
  await createSequenceForLead(lead.id, lead.visitDate).catch((err) => {
    console.error("Failed to create sequence for lead", lead.id, err);
  });

  // Compute initial score
  await recomputeAndSaveScore(lead.id).catch((err) =>
    logger.error({ err, leadId: lead.id }, "Failed to compute initial score for new lead"),
  );

  res.status(201).json(CreateLeadResponse.parse(serializeLead(lead)));
});

router.get("/leads/:id", async (req, res): Promise<void> => {
  const params = GetLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, params.data.id));

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const events = await db
    .select()
    .from(leadEventsTable)
    .where(eq(leadEventsTable.leadId, lead.id))
    .orderBy(desc(leadEventsTable.createdAt));

  res.json(GetLeadResponse.parse({ ...serializeLead(lead), events: events.map(serializeEvent) }));
});

router.patch("/leads/:id", async (req, res): Promise<void> => {
  const params = UpdateLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateLeadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { visitDate, status, ...rest } = parsed.data;

  const [existing] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const updateData: Record<string, unknown> = {
    ...rest,
    updatedAt: new Date(),
  };
  if (visitDate !== undefined) {
    updateData.visitDate = new Date(visitDate);
  }
  if (status !== undefined) {
    updateData.status = status;
  }

  const [lead] = await db
    .update(leadsTable)
    .set(updateData)
    .where(eq(leadsTable.id, params.data.id))
    .returning();

  if (status && status !== existing.status) {
    await db.insert(leadEventsTable).values({
      leadId: lead.id,
      type: "status_change",
      note: `Status changed from ${existing.status} to ${status}`,
    });

    // Auto-cancel follow-up sequence when lead is Won or Lost
    if (status === "won" || status === "lost") {
      await db
        .update(leadSequencesTable)
        .set({ cancelled: true, nextSendAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(leadSequencesTable.leadId, lead.id),
            eq(leadSequencesTable.cancelled, false),
          ),
        );
    }
  }

  // Recompute score after any update
  await recomputeAndSaveScore(lead.id).catch((err) =>
    logger.error({ err, leadId: lead.id }, "Failed to recompute score after lead update"),
  );
  const [updatedLead] = await db.select().from(leadsTable).where(eq(leadsTable.id, lead.id));

  res.json(UpdateLeadResponse.parse(serializeLead(updatedLead ?? lead)));
});

router.delete("/leads/:id", async (req, res): Promise<void> => {
  const params = DeleteLeadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [lead] = await db
    .delete(leadsTable)
    .where(eq(leadsTable.id, params.data.id))
    .returning();

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/leads/:id/events", async (req, res): Promise<void> => {
  const params = CreateLeadEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateLeadEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.id, params.data.id));

  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const [event] = await db
    .insert(leadEventsTable)
    .values({ leadId: params.data.id, ...parsed.data })
    .returning();

  // Recompute score after new activity
  await recomputeAndSaveScore(params.data.id).catch((err) =>
    logger.error({ err, leadId: params.data.id }, "Failed to recompute score after event creation"),
  );

  res.status(201).json(CreateLeadEventResponse.parse(serializeEvent(event)));
});

router.get("/leads/:id/score", async (req, res): Promise<void> => {
  const params = GetLeadScoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, params.data.id));
  if (!lead) {
    res.status(404).json({ error: "Lead not found" });
    return;
  }

  const result = await computeScore(params.data.id);
  res.json(GetLeadScoreResponse.parse({ score: result.score, factors: result.factors }));
});

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const statusCounts = await db
    .select({
      status: leadsTable.status,
      count: count(),
    })
    .from(leadsTable)
    .groupBy(leadsTable.status);

  const counts = {
    new: 0,
    contacted: 0,
    interested: 0,
    won: 0,
    lost: 0,
  };
  for (const row of statusCounts) {
    counts[row.status] = row.count;
  }

  const totalLeads = Object.values(counts).reduce((a, b) => a + b, 0);
  const conversionRate =
    totalLeads > 0
      ? Math.round((counts.won / totalLeads) * 100 * 10) / 10
      : 0;

  const followUpThreshold = new Date();
  followUpThreshold.setDate(followUpThreshold.getDate() - 3);

  const [followUpsResult] = await db
    .select({ count: count() })
    .from(leadsTable)
    .where(
      and(
        sql`${leadsTable.status} IN ('new', 'contacted')`,
        sql`${leadsTable.visitDate} <= ${followUpThreshold.toISOString()}`,
      ),
    );

  const recentLeads = await db
    .select()
    .from(leadsTable)
    .orderBy(desc(leadsTable.createdAt))
    .limit(5);

  const hotLeads = await db
    .select()
    .from(leadsTable)
    .where(notInArray(leadsTable.status, ["won", "lost"]))
    .orderBy(desc(leadsTable.score))
    .limit(5);

  const summary = {
    totalLeads,
    newLeads: counts.new,
    contactedLeads: counts.contacted,
    interestedLeads: counts.interested,
    wonLeads: counts.won,
    lostLeads: counts.lost,
    followUpsDueToday: followUpsResult?.count ?? 0,
    conversionRate,
    recentLeads: recentLeads.map(serializeLead),
    hotLeads: hotLeads.map(serializeLead),
  };

  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/dashboard/action-queue", async (_req, res): Promise<void> => {
  const now = new Date();
  // Overdue follow-up threshold: 3 days since visit without conversion (mirrors followUpsDueToday)
  const followUpThreshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  // Sequence step "due" window: any step whose nextSendAt is at or before now+24h
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const ago7days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const ago14days = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Fetch active leads (exclude won/lost)
  const activeLeads = await db
    .select()
    .from(leadsTable)
    .where(sql`${leadsTable.status} NOT IN ('won', 'lost')`);

  // Fetch all active (non-paused, non-cancelled) sequences
  const sequences = await db
    .select()
    .from(leadSequencesTable)
    .where(
      and(
        eq(leadSequencesTable.paused, false),
        eq(leadSequencesTable.cancelled, false),
      ),
    );

  const seqByLeadId = new Map(sequences.map((s) => [s.leadId, s]));

  // Most recent event per lead (for stale-contact calculation)
  const recentEventRows = await db
    .select({
      leadId: leadEventsTable.leadId,
      latestAt: sql<Date>`MAX(${leadEventsTable.createdAt})`,
    })
    .from(leadEventsTable)
    .groupBy(leadEventsTable.leadId);

  const lastEventByLeadId = new Map(recentEventRows.map((r) => [r.leadId, new Date(r.latestAt)]));

  type ActionEntry = {
    leadId: number;
    name: string;
    email: string;
    phone: string;
    status: "new" | "contacted" | "interested" | "won" | "lost";
    score: number;
    urgencyScore: number;
    primaryReason: string;
    secondaryReasons: string[];
    daysSinceContact: number | null;
    sequenceStepDue: number | null;
  };

  const entries: ActionEntry[] = [];

  for (const lead of activeLeads) {
    let urgencyScore = 0;
    const reasons: string[] = [];
    let sequenceStepDue: number | null = null;

    // --- Rule 1: Overdue follow-up (+50) ---
    // A lead that visited 3+ days ago and is still new/contacted needs a human touch.
    // This is the manual follow-up signal, independent of the automated sequence.
    const isOverdueFollowUp =
      (lead.status === "new" || lead.status === "contacted") &&
      new Date(lead.visitDate) <= followUpThreshold;

    if (isOverdueFollowUp) {
      urgencyScore += 50;
      reasons.push("Overdue follow-up");
    }

    // --- Rule 2: Sequence step due (+40) ---
    // An active sequence step is due within the next 24h (or already past-due).
    // Treated as a single "sequence due" signal regardless of how overdue it is.
    const seq = seqByLeadId.get(lead.id);
    const seqNextSendAt = seq?.nextSendAt ? new Date(seq.nextSendAt) : null;
    const isSeqStepDue = seqNextSendAt !== null && seqNextSendAt <= in24h;

    if (isSeqStepDue && seq) {
      urgencyScore += 40;
      reasons.push(seqNextSendAt! < now ? "Sequence step overdue" : "Sequence step due today");
      sequenceStepDue = seq.currentStep;
    }

    // --- Rule 3: Lead score weight (+20 / +10) ---
    if (lead.score >= 70) {
      urgencyScore += 20;
      reasons.push("High lead score");
    } else if (lead.score >= 40) {
      urgencyScore += 10;
      reasons.push("Medium lead score");
    }

    // --- Rule 4: Days since last contact (+25 / +15) ---
    // Fall back to visitDate so brand-new leads with no events are not falsely penalised.
    const lastEvent = lastEventByLeadId.get(lead.id);
    const lastKnownActivity: Date = lastEvent ?? new Date(lead.visitDate);
    const daysSinceContact = Math.floor(
      (now.getTime() - lastKnownActivity.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (lastKnownActivity < ago14days) {
      urgencyScore += 25;
      reasons.push("No contact in 14+ days");
    } else if (lastKnownActivity < ago7days) {
      urgencyScore += 15;
      reasons.push("No contact in 7+ days");
    }

    // --- Rule 5: Status weight (+15 / +5) ---
    if (lead.status === "interested") {
      urgencyScore += 15;
      reasons.push("Interested lead");
    } else if (lead.status === "contacted") {
      urgencyScore += 5;
    }

    // Skip leads with no urgency (e.g. brand-new leads with no triggers yet)
    if (urgencyScore === 0) continue;

    entries.push({
      leadId: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      status: lead.status,
      score: lead.score,
      urgencyScore,
      primaryReason: reasons[0] ?? "Needs attention",
      secondaryReasons: reasons.slice(1),
      daysSinceContact,
      sequenceStepDue,
    });
  }

  entries.sort((a, b) => b.urgencyScore - a.urgencyScore);
  const top8 = entries.slice(0, 8);

  res.json(GetDashboardActionQueueResponse.parse({ actions: top8 }));
});

export default router;
