import { db, leadsTable, leadEventsTable, outboundMessagesTable, leadSequencesTable } from "@workspace/db";
import { eq, count, and } from "drizzle-orm";

export interface ScoreFactors {
  visitRecency: number;
  status: number;
  activity: number;
  outreachEngagement: number;
  sequenceProgress: number;
}

export interface ScoreResult {
  score: number;
  factors: ScoreFactors;
}

const STATUS_POINTS: Record<string, number> = {
  new: 5,
  contacted: 10,
  interested: 20,
  won: 0,
  lost: 0,
};

export async function computeScore(leadId: number): Promise<ScoreResult> {
  const [lead] = await db.select().from(leadsTable).where(eq(leadsTable.id, leadId));
  if (!lead) return { score: 0, factors: { visitRecency: 0, status: 0, activity: 0, outreachEngagement: 0, sequenceProgress: 0 } };

  const now = new Date();
  const visitDate = new Date(lead.visitDate);
  const daysSinceVisit = Math.max(0, (now.getTime() - visitDate.getTime()) / (1000 * 60 * 60 * 24));

  // Visit recency: 30 pts max, linear decay from 3d (full) to 30d (0)
  const visitRecency = daysSinceVisit <= 3
    ? 30
    : daysSinceVisit >= 30
      ? 0
      : Math.round(30 * (1 - (daysSinceVisit - 3) / 27));

  // Status
  const status = STATUS_POINTS[lead.status] ?? 0;

  // Activity: 5 pts per note/event, capped at 20
  const [eventCount] = await db
    .select({ count: count() })
    .from(leadEventsTable)
    .where(eq(leadEventsTable.leadId, leadId));
  const activity = Math.min(20, (eventCount?.count ?? 0) * 5);

  // Outreach engagement: proportion of sent (non-failed) messages × 15 pts
  const [totalMsgs] = await db
    .select({ count: count() })
    .from(outboundMessagesTable)
    .where(eq(outboundMessagesTable.leadId, leadId));
  const [sentMsgs] = await db
    .select({ count: count() })
    .from(outboundMessagesTable)
    .where(and(eq(outboundMessagesTable.leadId, leadId), eq(outboundMessagesTable.status, "sent")));
  const total = totalMsgs?.count ?? 0;
  const sent = sentMsgs?.count ?? 0;
  const outreachEngagement = total > 0 ? Math.round((sent / total) * 15) : 0;

  // Sequence progress: 2.5 pts per completed step
  const [seq] = await db.select().from(leadSequencesTable).where(eq(leadSequencesTable.leadId, leadId));
  const sequenceProgress = seq ? Math.min(10, seq.currentStep * 2.5) : 0;

  const score = Math.min(100, Math.round(visitRecency + status + activity + outreachEngagement + sequenceProgress));

  return {
    score,
    factors: { visitRecency, status, activity, outreachEngagement, sequenceProgress },
  };
}

export async function recomputeAndSaveScore(leadId: number): Promise<void> {
  const result = await computeScore(leadId);
  await db
    .update(leadsTable)
    .set({ score: result.score, scoreFactors: result.factors, updatedAt: new Date() })
    .where(eq(leadsTable.id, leadId));
}

export async function recomputeAllActiveScores(): Promise<void> {
  const activeLeads = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(eq(leadsTable.status, "new"))
    .limit(200);

  const otherLeads = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(eq(leadsTable.status, "contacted"))
    .limit(200);

  const interestedLeads = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(eq(leadsTable.status, "interested"))
    .limit(200);

  const allIds = [...activeLeads, ...otherLeads, ...interestedLeads].map(r => r.id);
  const unique = [...new Set(allIds)];

  await Promise.all(unique.map(id => recomputeAndSaveScore(id).catch(() => {})));
}
