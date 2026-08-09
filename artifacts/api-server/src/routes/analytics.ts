import { Router, type IRouter } from "express";
import { count, sql, eq } from "drizzle-orm";
import { db, leadsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

async function fetchAllAnalyticsData(gymId: string) {
  const [pulseResult, funnelRows, trendResult, scoreResult, seqResult] = await Promise.all([
    // Pulse
    (async () => {
      const now = new Date();
      const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [r7d, r30d, rScore, rVelocity, rActive] = await Promise.all([
        db.execute(sql`SELECT COUNT(*)::int AS total, COUNT(CASE WHEN status = 'won' THEN 1 END)::int AS won FROM leads WHERE gym_id = ${gymId} AND created_at >= ${last7.toISOString()}`),
        db.execute(sql`SELECT COUNT(*)::int AS total, COUNT(CASE WHEN status = 'won' THEN 1 END)::int AS won FROM leads WHERE gym_id = ${gymId} AND created_at >= ${last30.toISOString()}`),
        db.execute(sql`SELECT COALESCE(AVG(score), 0) AS avg_score FROM leads WHERE gym_id = ${gymId}`),
        db.execute(sql`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400), 0) AS avg_days FROM leads WHERE gym_id = ${gymId} AND status = 'won'`),
        db.execute(sql`SELECT COUNT(*)::int AS cnt FROM leads WHERE gym_id = ${gymId} AND status NOT IN ('won', 'lost')`),
      ]);

      const c7 = r7d.rows[0] as { total: string | number; won: string | number } | undefined;
      const c30 = r30d.rows[0] as { total: string | number; won: string | number } | undefined;
      const t7 = Number(c7?.total ?? 0), w7 = Number(c7?.won ?? 0);
      const t30 = Number(c30?.total ?? 0), w30 = Number(c30?.won ?? 0);

      return {
        avgConversionRate7d: t7 > 0 ? Math.round(w7 / t7 * 100 * 10) / 10 : 0,
        avgConversionRate30d: t30 > 0 ? Math.round(w30 / t30 * 100 * 10) / 10 : 0,
        avgLeadScore: Math.round(Number((rScore.rows[0] as { avg_score?: string | number } | undefined)?.avg_score ?? 0)),
        pipelineVelocityDays: Math.round(Number((rVelocity.rows[0] as { avg_days?: string | number } | undefined)?.avg_days ?? 0) * 10) / 10,
        totalActiveLeads: Number((rActive.rows[0] as { cnt?: string | number } | undefined)?.cnt ?? 0),
      };
    })(),

    // Pipeline funnel
    db.select({ status: leadsTable.status, count: count() })
      .from(leadsTable)
      .where(eq(leadsTable.gymId, gymId))
      .groupBy(leadsTable.status),

    // Conversion trend
    db.execute(sql`
      WITH weeks AS (
        SELECT generate_series(date_trunc('week', NOW() - INTERVAL '11 weeks'), date_trunc('week', NOW()), '1 week'::interval) AS week_start
      )
      SELECT to_char(w.week_start, 'YYYY-MM-DD') AS "weekStart", COUNT(l.id)::int AS total,
        COUNT(CASE WHEN l.status = 'won' THEN 1 END)::int AS won,
        CASE WHEN COUNT(l.id) = 0 THEN 0 ELSE ROUND(COUNT(CASE WHEN l.status = 'won' THEN 1 END)::numeric / COUNT(l.id) * 100, 1) END AS rate
      FROM weeks w LEFT JOIN leads l ON date_trunc('week', l.created_at) = w.week_start AND l.gym_id = ${gymId}
      GROUP BY w.week_start ORDER BY w.week_start
    `),

    // Score distribution
    db.execute(sql`
      SELECT CASE WHEN score BETWEEN 0 AND 19 THEN '0–19' WHEN score BETWEEN 20 AND 39 THEN '20–39'
        WHEN score BETWEEN 40 AND 59 THEN '40–59' WHEN score BETWEEN 60 AND 79 THEN '60–79'
        WHEN score BETWEEN 80 AND 100 THEN '80–100' END AS label, COUNT(*)::int AS count
      FROM leads WHERE gym_id = ${gymId} GROUP BY label
    `),

    // Sequence funnel
    db.execute(sql`
      SELECT s.step_num AS step, COUNT(DISTINCT ls.lead_id)::int AS reached,
        COUNT(DISTINCT CASE WHEN l.status = 'won' THEN ls.lead_id END)::int AS "convertedAfter"
      FROM (VALUES (1),(2),(3),(4)) AS s(step_num)
      LEFT JOIN lead_sequences ls ON ls.current_step >= s.step_num
      LEFT JOIN leads l ON l.id = ls.lead_id AND l.gym_id = ${gymId}
      GROUP BY s.step_num ORDER BY s.step_num
    `),
  ]);

  const statusLabels: Record<string, string> = { new: "New", contacted: "Contacted", interested: "Interested", won: "Won", lost: "Lost" };
  const statusOrder = ["new", "contacted", "interested", "won", "lost"] as const;
  const countMap: Record<string, number> = {};
  for (const row of funnelRows) countMap[row.status] = row.count;
  const stages = statusOrder.map((s) => ({ status: s, count: countMap[s] ?? 0, label: statusLabels[s] }));

  const trendRows = trendResult.rows as Array<{ weekStart: string; total: string | number; won: string | number; rate: string | number }>;
  const weeks = trendRows.map((r) => ({ weekStart: r.weekStart, total: Number(r.total), won: Number(r.won), rate: Number(r.rate) }));

  const scoreRows = scoreResult.rows as Array<{ label: string; count: string | number }>;
  const scoreMap: Record<string, number> = {};
  for (const r of scoreRows) scoreMap[r.label] = Number(r.count);
  const buckets = [
    { label: "0–19", min: 0, max: 19, count: scoreMap["0–19"] ?? 0 },
    { label: "20–39", min: 20, max: 39, count: scoreMap["20–39"] ?? 0 },
    { label: "40–59", min: 40, max: 59, count: scoreMap["40–59"] ?? 0 },
    { label: "60–79", min: 60, max: 79, count: scoreMap["60–79"] ?? 0 },
    { label: "80–100", min: 80, max: 100, count: scoreMap["80–100"] ?? 0 },
  ];

  const stepLabels: Record<number, string> = { 1: "Step 1 – Outreach", 2: "Step 2 – Follow-Up", 3: "Step 3 – Check-In", 4: "Step 4 – Final Nudge" };
  const seqRows = seqResult.rows as Array<{ step: string | number; reached: string | number; convertedAfter: string | number }>;
  const steps = seqRows.map((r) => ({ step: Number(r.step), label: stepLabels[Number(r.step)] ?? `Step ${r.step}`, reached: Number(r.reached), convertedAfter: Number(r.convertedAfter) }));

  return { pulse: pulseResult, stages, weeks, buckets, steps };
}

router.get("/analytics/conversion-trend", async (req, res): Promise<void> => {
  try {
    const gymId = req.dbUser!.gymId!;
    const result = await db.execute(sql`
      WITH weeks AS (
        SELECT generate_series(
          date_trunc('week', NOW() - INTERVAL '11 weeks'),
          date_trunc('week', NOW()),
          '1 week'::interval
        ) AS week_start
      )
      SELECT
        to_char(w.week_start, 'YYYY-MM-DD') AS "weekStart",
        COUNT(l.id)::int AS total,
        COUNT(CASE WHEN l.status = 'won' THEN 1 END)::int AS won,
        CASE
          WHEN COUNT(l.id) = 0 THEN 0
          ELSE ROUND(COUNT(CASE WHEN l.status = 'won' THEN 1 END)::numeric / COUNT(l.id) * 100, 1)
        END AS rate
      FROM weeks w
      LEFT JOIN leads l
        ON date_trunc('week', l.created_at) = w.week_start AND l.gym_id = ${gymId}
      GROUP BY w.week_start
      ORDER BY w.week_start
    `);

    const rows = result.rows as Array<{ weekStart: string; total: string | number; won: string | number; rate: string | number }>;
    const weeks = rows.map((row) => ({
      weekStart: row.weekStart,
      total: Number(row.total),
      won: Number(row.won),
      rate: Number(row.rate),
    }));

    res.json({ weeks });
  } catch (err) {
    logger.error({ err }, "Failed to fetch conversion trend");
    res.status(500).json({ error: "Failed to fetch conversion trend" });
  }
});

router.get("/analytics/pipeline-funnel", async (req, res): Promise<void> => {
  try {
    const gymId = req.dbUser!.gymId!;
    const statusOrder = ["new", "contacted", "interested", "won", "lost"] as const;
    const statusLabels: Record<string, string> = {
      new: "New",
      contacted: "Contacted",
      interested: "Interested",
      won: "Won",
      lost: "Lost",
    };

    const rows = await db
      .select({ status: leadsTable.status, count: count() })
      .from(leadsTable)
      .where(eq(leadsTable.gymId, gymId))
      .groupBy(leadsTable.status);

    const countMap: Record<string, number> = {};
    for (const row of rows) {
      countMap[row.status] = row.count;
    }

    const stages = statusOrder.map((status) => ({
      status,
      count: countMap[status] ?? 0,
      label: statusLabels[status],
    }));

    res.json({ stages });
  } catch (err) {
    logger.error({ err }, "Failed to fetch pipeline funnel");
    res.status(500).json({ error: "Failed to fetch pipeline funnel" });
  }
});

router.get("/analytics/sequence-funnel", async (req, res): Promise<void> => {
  try {
    const gymId = req.dbUser!.gymId!;
    const stepLabels: Record<number, string> = {
      1: "Step 1 – Outreach",
      2: "Step 2 – Follow-Up",
      3: "Step 3 – Check-In",
      4: "Step 4 – Final Nudge",
    };

    const result = await db.execute(sql`
      SELECT
        s.step_num AS step,
        COUNT(DISTINCT ls.lead_id)::int AS reached,
        COUNT(DISTINCT CASE WHEN l.status = 'won' THEN ls.lead_id END)::int AS "convertedAfter"
      FROM (VALUES (1),(2),(3),(4)) AS s(step_num)
      LEFT JOIN lead_sequences ls
        ON ls.current_step >= s.step_num
      LEFT JOIN leads l
        ON l.id = ls.lead_id AND l.gym_id = ${gymId}
      GROUP BY s.step_num
      ORDER BY s.step_num
    `);

    const rows = result.rows as Array<{ step: string | number; reached: string | number; convertedAfter: string | number }>;
    const steps = rows.map((row) => ({
      step: Number(row.step),
      label: stepLabels[Number(row.step)] ?? `Step ${row.step}`,
      reached: Number(row.reached),
      convertedAfter: Number(row.convertedAfter),
    }));

    res.json({ steps });
  } catch (err) {
    logger.error({ err }, "Failed to fetch sequence funnel");
    res.status(500).json({ error: "Failed to fetch sequence funnel" });
  }
});

router.get("/analytics/score-distribution", async (req, res): Promise<void> => {
  try {
    const gymId = req.dbUser!.gymId!;
    const bucketDefs = [
      { label: "0–19", min: 0, max: 19 },
      { label: "20–39", min: 20, max: 39 },
      { label: "40–59", min: 40, max: 59 },
      { label: "60–79", min: 60, max: 79 },
      { label: "80–100", min: 80, max: 100 },
    ];

    const result = await db.execute(sql`
      SELECT
        CASE
          WHEN score BETWEEN 0 AND 19 THEN '0–19'
          WHEN score BETWEEN 20 AND 39 THEN '20–39'
          WHEN score BETWEEN 40 AND 59 THEN '40–59'
          WHEN score BETWEEN 60 AND 79 THEN '60–79'
          WHEN score BETWEEN 80 AND 100 THEN '80–100'
        END AS label,
        COUNT(*)::int AS count
      FROM leads WHERE gym_id = ${gymId}
      GROUP BY label
    `);

    const rows = result.rows as Array<{ label: string; count: string | number }>;
    const countMap: Record<string, number> = {};
    for (const row of rows) {
      countMap[row.label] = Number(row.count);
    }

    const buckets = bucketDefs.map((b) => ({
      ...b,
      count: countMap[b.label] ?? 0,
    }));

    res.json({ buckets });
  } catch (err) {
    logger.error({ err }, "Failed to fetch score distribution");
    res.status(500).json({ error: "Failed to fetch score distribution" });
  }
});

router.get("/analytics/pulse", async (req, res): Promise<void> => {
  try {
    const gymId = req.dbUser!.gymId!;
    const now = new Date();
    const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const result7d = await db.execute(sql`
      SELECT COUNT(*)::int AS total, COUNT(CASE WHEN status = 'won' THEN 1 END)::int AS won
      FROM leads WHERE gym_id = ${gymId} AND created_at >= ${last7.toISOString()}
    `);
    const counts7d = result7d.rows[0] as { total: string | number; won: string | number } | undefined;

    const result30d = await db.execute(sql`
      SELECT COUNT(*)::int AS total, COUNT(CASE WHEN status = 'won' THEN 1 END)::int AS won
      FROM leads WHERE gym_id = ${gymId} AND created_at >= ${last30.toISOString()}
    `);
    const counts30d = result30d.rows[0] as { total: string | number; won: string | number } | undefined;

    const scoreResult = await db.execute(sql`SELECT COALESCE(AVG(score), 0) AS avg_score FROM leads WHERE gym_id = ${gymId}`);
    const scoreRow = scoreResult.rows[0] as { avg_score: string | number } | undefined;

    const velocityResult = await db.execute(sql`
      SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400), 0) AS avg_days
      FROM leads WHERE gym_id = ${gymId} AND status = 'won'
    `);
    const velocityRow = velocityResult.rows[0] as { avg_days: string | number } | undefined;

    const activeResult = await db.execute(sql`SELECT COUNT(*)::int AS cnt FROM leads WHERE gym_id = ${gymId} AND status NOT IN ('won', 'lost')`);
    const activeRow = activeResult.rows[0] as { cnt: string | number } | undefined;

    const total7d = Number(counts7d?.total ?? 0);
    const won7d = Number(counts7d?.won ?? 0);
    const total30d = Number(counts30d?.total ?? 0);
    const won30d = Number(counts30d?.won ?? 0);

    res.json({
      avgConversionRate7d: total7d > 0 ? Math.round(won7d / total7d * 100 * 10) / 10 : 0,
      avgConversionRate30d: total30d > 0 ? Math.round(won30d / total30d * 100 * 10) / 10 : 0,
      avgLeadScore: Math.round(Number(scoreRow?.avg_score ?? 0)),
      pipelineVelocityDays: Math.round(Number(velocityRow?.avg_days ?? 0) * 10) / 10,
      totalActiveLeads: Number(activeRow?.cnt ?? 0),
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch analytics pulse");
    res.status(500).json({ error: "Failed to fetch analytics pulse" });
  }
});

router.post("/analytics/insights", async (req, res): Promise<void> => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const gymId = req.dbUser!.gymId!;
    const focus = req.body?.focus as string | undefined;
    const data = await fetchAllAnalyticsData(gymId);

    const prompt = `You are an expert gym sales coach and CRM analyst. Analyze this lead pipeline data and provide 3-5 concise, actionable insights for the sales manager.

PIPELINE METRICS:
- 7-day conversion rate: ${data.pulse.avgConversionRate7d}%
- 30-day conversion rate: ${data.pulse.avgConversionRate30d}%
- Average lead score: ${data.pulse.avgLeadScore}/100
- Pipeline velocity: ${data.pulse.pipelineVelocityDays} days avg to close
- Active leads: ${data.pulse.totalActiveLeads}

PIPELINE STAGES:
${data.stages.map((s) => `- ${s.label}: ${s.count} leads`).join("\n")}

CONVERSION TREND (last 12 weeks):
${data.weeks.filter((w) => w.total > 0).map((w) => `- Week of ${w.weekStart}: ${w.total} leads, ${w.rate}% conversion`).join("\n") || "- No leads with history yet"}

SCORE DISTRIBUTION:
${data.buckets.map((b) => `- ${b.label} score: ${b.count} leads`).join("\n")}

SEQUENCE PERFORMANCE:
${data.steps.map((s) => `- ${s.label}: ${s.reached} reached, ${s.convertedAfter} converted after`).join("\n")}
${focus ? `\nFocus your insights specifically on: ${focus}` : ""}

Format your response with clear numbered insights. Be specific, actionable, and brief. Use real numbers from the data.`;

    const { anthropic } = await import("@workspace/integrations-anthropic-ai");
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      messages: [{ role: "user", content: prompt }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    logger.error({ err }, "Failed to stream analytics insights");
    res.write(`data: ${JSON.stringify({ error: "Failed to generate insights" })}\n\n`);
    res.end();
  }
});

export default router;
