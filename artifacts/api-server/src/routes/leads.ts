import { Router, type IRouter } from "express";
import { eq, ilike, or, and, desc, count, sql } from "drizzle-orm";
import { db, leadsTable, leadEventsTable } from "@workspace/db";
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
} from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router: IRouter = Router();

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

  res.json(ListLeadsResponse.parse(leads));
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

  res.status(201).json(CreateLeadResponse.parse(lead));
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

  res.json(GetLeadResponse.parse({ ...lead, events }));
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
  }

  res.json(UpdateLeadResponse.parse(lead));
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

  res.status(201).json(CreateLeadEventResponse.parse(event));
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const followUpThreshold = new Date(today);
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

  const summary = {
    totalLeads,
    newLeads: counts.new,
    contactedLeads: counts.contacted,
    interestedLeads: counts.interested,
    wonLeads: counts.won,
    lostLeads: counts.lost,
    followUpsDueToday: followUpsResult?.count ?? 0,
    conversionRate,
    recentLeads,
  };

  res.json(GetDashboardSummaryResponse.parse(summary));
});

export default router;
