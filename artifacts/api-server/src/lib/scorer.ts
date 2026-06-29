import { db, leadsTable, leadEventsTable, outboundMessagesTable, leadSequencesTable } from "@workspace/db";
import { eq, count, and, isNotNull, notInArray, inArray } from "drizzle-orm";
import { logger } from "./logger.js";

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
  if (!lead) {
    return { score: 0, factors: { visitRecency: 0, status: 0, activity: 0, outreachEngagement: 0, sequenceProgress: 0 } };
  }

  const now = new Date();
  const visitDate = new Date(lead.visitDate);
  const daysSinceVisit = Math.max(0, (now.getTime() - visitDate.getTime()) / (1000 * 60 * 60 * 24));

  // Visit recency: 30 pts max, full score within 3 days, linear decay to 0 at 30 days
  const visitRecency = daysSinceVisit <= 3
    ? 30
    : daysSinceVisit >= 30
      ? 0
      : Math.round(30 * (1 - (daysSinceVisit - 3) / 27));

  // Status
  const status = STATUS_POINTS[lead.status] ?? 0;

  // Activity: 5 pts per note/event, capped at 20
  const [eventRow] = await db
    .select({ count: count() })
    .from(leadEventsTable)
    .where(eq(leadEventsTable.leadId, leadId));
  const activity = Math.min(20, (eventRow?.count ?? 0) * 5);

  // Outreach engagement: sequence messages only (sequenceStep IS NOT NULL).
  // Denominator = sent + failed (resolved messages; pending are excluded as unresolved).
  // Numerator = sent. Score = sent / (sent + failed) × 15.
  const [sentSeqRow] = await db
    .select({ count: count() })
    .from(outboundMessagesTable)
    .where(
      and(
        eq(outboundMessagesTable.leadId, leadId),
        isNotNull(outboundMessagesTable.sequenceStep),
        eq(outboundMessagesTable.status, "sent"),
      ),
    );
  const [failedSeqRow] = await db
    .select({ count: count() })
    .from(outboundMessagesTable)
    .where(
      and(
        eq(outboundMessagesTable.leadId, leadId),
        isNotNull(outboundMessagesTable.sequenceStep),
        eq(outboundMessagesTable.status, "failed"),
      ),
    );
  const sentSeq = sentSeqRow?.count ?? 0;
  const failedSeq = failedSeqRow?.count ?? 0;
  const resolvedSeq = sentSeq + failedSeq;
  const outreachEngagement = resolvedSeq > 0 ? Math.round((sentSeq / resolvedSeq) * 15) : 0;

  // Sequence progress: 2.5 pts per completed step, capped at 10
  const [seq] = await db
    .select()
    .from(leadSequencesTable)
    .where(eq(leadSequencesTable.leadId, leadId));
  const sequenceProgress = seq ? Math.min(10, Math.round(seq.currentStep * 2.5)) : 0;

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

const BATCH_SIZE = 50;

export async function recomputeAllActiveScores(): Promise<void> {
  // Fetch all active lead IDs (not won/lost) in one query — no per-status cap
  const activeLeads = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(notInArray(leadsTable.status, ["won", "lost"]));

  if (activeLeads.length === 0) return;

  const ids = activeLeads.map((r) => r.id);
  logger.info({ count: ids.length }, "Recomputing scores for active leads");

  // Process in batches of BATCH_SIZE to avoid overwhelming the DB
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((id) =>
        recomputeAndSaveScore(id).catch((err) =>
          logger.error({ err, leadId: id }, "Failed to recompute score for lead"),
        ),
      ),
    );
  }

  logger.info({ count: ids.length }, "Score recompute complete");
}
