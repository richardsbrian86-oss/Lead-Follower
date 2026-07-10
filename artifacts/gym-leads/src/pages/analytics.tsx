import React, { useState, useRef, useCallback, useEffect } from "react";
import { z } from "zod";
import {
  useGetAnalyticsPulse,
  useGetAnalyticsConversionTrend,
  useGetAnalyticsPipelineFunnel,
  useGetAnalyticsSequenceFunnel,
  useGetAnalyticsScoreDistribution,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Target, Zap, Users, Activity, Sparkles, RefreshCw } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  Legend,
} from "recharts";
import { format } from "date-fns";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

function useChartHeight() {
  const [height, setHeight] = useState(() => (window.innerWidth < 768 ? 250 : 300));
  useEffect(() => {
    const onResize = () => setHeight(window.innerWidth < 768 ? 250 : 300);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return height;
}

// ─── Runtime schema validators ────────────────────────────────────────────────
const PulseSchema = z.object({
  avgConversionRate7d: z.number(),
  avgConversionRate30d: z.number(),
  avgLeadScore: z.number(),
  pipelineVelocityDays: z.number(),
  totalActiveLeads: z.number(),
});

const ConversionTrendSchema = z.object({
  weeks: z.array(
    z.object({ weekStart: z.string(), total: z.number(), won: z.number(), rate: z.number() })
  ),
});

const PipelineFunnelSchema = z.object({
  stages: z.array(
    z.object({ status: z.string(), count: z.number(), label: z.string() })
  ),
});

const SequenceFunnelSchema = z.object({
  steps: z.array(
    z.object({ step: z.number(), label: z.string(), reached: z.number(), convertedAfter: z.number() })
  ),
});

const ScoreDistributionSchema = z.object({
  buckets: z.array(
    z.object({ label: z.string(), min: z.number(), max: z.number(), count: z.number() })
  ),
});

function validateOrWarn<T>(schema: z.ZodType<T>, data: unknown, label: string): T | null {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(`[Analytics] Schema mismatch in "${label}":`, result.error.format());
    return null;
  }
  return result.data;
}
// ─────────────────────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  contentStyle: { background: "#152236", border: "1px solid #1e3448", borderRadius: "8px" },
  labelStyle: { color: "#94a3b8" },
  itemStyle: { color: "#e2e8f0" },
};

const SCORE_BUCKET_COLORS: Record<string, string> = {
  "0–19": "#ef4444",
  "20–39": "#f97316",
  "40–59": "#f59e0b",
  "60–79": "#00c8f0",
  "80–100": "#10b981",
};

const PIPELINE_STAGE_COLORS: Record<string, string> = {
  new: "#38bdf8",
  contacted: "#f59e0b",
  interested: "#a78bfa",
  won: "#10b981",
  lost: "#71717a",
};

function PulseCardSkeleton() {
  return (
    <Card className="border-none shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-5 w-5 rounded-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-20" />
      </CardContent>
    </Card>
  );
}

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return <Skeleton className="w-full rounded-lg" style={{ height }} />;
}

function AIInsightsPanel() {
  const [insights, setInsights] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const generateInsights = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setInsights("");
    setLoading(true);
    setGenerated(false);

    try {
      const response = await fetch(`${BASE_URL}/api/analytics/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        setInsights("Failed to generate insights. Please try again.");
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.done) {
              setGenerated(true);
            } else if (payload.content) {
              setInsights((prev) => prev + payload.content);
            } else if (payload.error) {
              setInsights("Error: " + payload.error);
            }
          } catch {
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setInsights("Connection error. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const formattedInsights = insights
    ? insights
        .split("\n")
        .map((line, i) => {
          const numbered = /^(\d+)\.\s+\*\*(.+?)\*\*(.*)/.exec(line);
          if (numbered) {
            return (
              <div key={i} className="flex gap-3 mb-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 text-xs font-bold flex items-center justify-center mt-0.5">
                  {numbered[1]}
                </span>
                <p className="text-sm leading-relaxed">
                  <span className="font-semibold text-foreground">{numbered[2]}</span>
                  <span className="text-muted-foreground">{numbered[3]}</span>
                </p>
              </div>
            );
          }
          if (line.startsWith("# ") || line.startsWith("## ")) {
            return <h3 key={i} className="font-bold text-foreground text-sm mt-3 mb-1">{line.replace(/^#+\s/, "")}</h3>;
          }
          if (line.trim() === "") return <div key={i} className="h-1" />;
          return <p key={i} className="text-sm text-muted-foreground leading-relaxed mb-1">{line}</p>;
        })
    : null;

  return (
    <Card className="border-none shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-xl flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-cyan-400" />
            AI Coaching Insights
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            Claude analyzes your pipeline and surfaces actionable recommendations
          </p>
        </div>
        <Button
          onClick={generateInsights}
          disabled={loading}
          size="sm"
          className="gap-2 flex-shrink-0"
          variant={generated ? "outline" : "default"}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Analyzing…" : generated ? "Refresh" : "Generate Insights"}
        </Button>
      </CardHeader>
      <CardContent>
        {!insights && !loading && (
          <div className="flex flex-col items-center justify-center py-10 border border-dashed border-border rounded-lg gap-3 text-center">
            <Sparkles className="w-8 h-8 text-cyan-400/50" />
            <p className="text-muted-foreground text-sm max-w-xs">
              Click <strong>Generate Insights</strong> to have Claude analyze your pipeline data and provide coaching recommendations.
            </p>
          </div>
        )}
        {(insights || loading) && (
          <div className="bg-secondary/20 rounded-lg p-5 min-h-[120px]">
            {formattedInsights}
            {loading && (
              <span className="inline-block w-1.5 h-4 bg-cyan-400 rounded-sm animate-pulse ml-0.5" />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  const chartHeight = useChartHeight();
  const { data: rawPulse, isLoading: pulseLoading } = useGetAnalyticsPulse();
  const { data: rawTrend, isLoading: trendLoading } = useGetAnalyticsConversionTrend();
  const { data: rawFunnel, isLoading: funnelLoading } = useGetAnalyticsPipelineFunnel();
  const { data: rawSeq, isLoading: seqLoading } = useGetAnalyticsSequenceFunnel();
  const { data: rawScore, isLoading: scoreLoading } = useGetAnalyticsScoreDistribution();

  // Validate each payload at runtime before passing to charts
  const pulse = rawPulse ? validateOrWarn(PulseSchema, rawPulse, "pulse") : null;
  const conversionTrend = rawTrend ? validateOrWarn(ConversionTrendSchema, rawTrend, "conversion-trend") : null;
  const pipelineFunnel = rawFunnel ? validateOrWarn(PipelineFunnelSchema, rawFunnel, "pipeline-funnel") : null;
  const sequenceFunnel = rawSeq ? validateOrWarn(SequenceFunnelSchema, rawSeq, "sequence-funnel") : null;
  const scoreDistribution = rawScore ? validateOrWarn(ScoreDistributionSchema, rawScore, "score-distribution") : null;

  const trendData = (conversionTrend?.weeks ?? []).map((w) => ({
    ...w,
    label: (() => {
      try {
        return format(new Date(w.weekStart), "MMM d");
      } catch {
        return w.weekStart;
      }
    })(),
  }));

  const improving = pulse ? pulse.avgConversionRate7d > pulse.avgConversionRate30d : undefined;

  const pulseCards = pulse
    ? [
        {
          title: "7-Day Conversion",
          value: `${pulse.avgConversionRate7d.toFixed(1)}%`,
          icon: Target,
          color: "text-cyan-400",
          suffix:
            improving !== undefined ? (
              improving ? (
                <span className="flex items-center gap-0.5 text-emerald-400 text-xs font-medium">
                  <TrendingUp className="w-3 h-3" /> vs 30d
                </span>
              ) : (
                <span className="flex items-center gap-0.5 text-red-400 text-xs font-medium">
                  <TrendingDown className="w-3 h-3" /> vs 30d
                </span>
              )
            ) : null,
        },
        {
          title: "30-Day Conversion",
          value: `${pulse.avgConversionRate30d.toFixed(1)}%`,
          icon: Activity,
          color: "text-violet-400",
        },
        {
          title: "Avg Lead Score",
          value: pulse.avgLeadScore,
          icon: Zap,
          color: "text-amber-400",
        },
        {
          title: "Pipeline Velocity",
          value: `${pulse.pipelineVelocityDays.toFixed(1)}d`,
          icon: TrendingUp,
          color: "text-emerald-400",
        },
        {
          title: "Active Leads",
          value: pulse.totalActiveLeads,
          icon: Users,
          color: "text-sky-400",
        },
      ]
    : null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1 text-lg">
          Trends, funnel performance, and lead intelligence.
        </p>
      </div>

      {/* Section 1 — Pulse Header */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
        {pulseLoading
          ? Array.from({ length: 5 }).map((_, i) => <PulseCardSkeleton key={i} />)
          : (pulseCards ?? []).map((card, i) => (
              <Card key={i} className="border-none shadow-md hover-elevate transition-all">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground leading-tight">
                    {card.title}
                  </CardTitle>
                  <card.icon className={`w-5 h-5 flex-shrink-0 ${card.color}`} />
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="text-3xl font-black">{card.value}</div>
                  {"suffix" in card && card.suffix ? card.suffix : null}
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Section 2 — Conversion Rate Trend */}
      <Card className="border-none shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">Conversion Rate Trend</CardTitle>
          <p className="text-sm text-muted-foreground">Weekly conversion % over the last 12 weeks</p>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <ChartSkeleton height={chartHeight} />
          ) : (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={trendData} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3448" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  axisLine={{ stroke: "#1e3448" }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: number) => [`${value}%`, "Conversion Rate"]}
                />
                <Line
                  type="monotone"
                  dataKey="rate"
                  stroke="#00c8f0"
                  strokeWidth={2.5}
                  dot={{ fill: "#00c8f0", r: 3, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#00c8f0" }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Section 3 — Two-column: Pipeline Funnel + Score Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-none shadow-md">
          <CardHeader>
            <CardTitle className="text-xl">Pipeline Funnel</CardTitle>
            <p className="text-sm text-muted-foreground">Leads at each stage</p>
          </CardHeader>
          <CardContent>
            {funnelLoading ? (
              <ChartSkeleton height={chartHeight} />
            ) : (
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart
                  layout="vertical"
                  data={pipelineFunnel?.stages ?? []}
                  margin={{ top: 4, right: 24, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e3448" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={80}
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(value: number) => [value, "Leads"]} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {(pipelineFunnel?.stages ?? []).map((stage) => (
                      <Cell
                        key={stage.status}
                        fill={PIPELINE_STAGE_COLORS[stage.status] ?? "#00c8f0"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-none shadow-md">
          <CardHeader>
            <CardTitle className="text-xl">Score Distribution</CardTitle>
            <p className="text-sm text-muted-foreground">Lead counts by score bracket</p>
          </CardHeader>
          <CardContent>
            {scoreLoading ? (
              <ChartSkeleton height={chartHeight} />
            ) : (
              <ResponsiveContainer width="100%" height={chartHeight}>
                <BarChart
                  data={scoreDistribution?.buckets ?? []}
                  margin={{ top: 4, right: 12, left: 0, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e3448" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...TOOLTIP_STYLE} formatter={(value: number) => [value, "Leads"]} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {(scoreDistribution?.buckets ?? []).map((bucket) => (
                      <Cell
                        key={bucket.label}
                        fill={SCORE_BUCKET_COLORS[bucket.label] ?? "#00c8f0"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Section 4 — Sequence Step Performance */}
      <Card className="border-none shadow-md">
        <CardHeader>
          <CardTitle className="text-xl">Sequence Step Performance</CardTitle>
          <p className="text-sm text-muted-foreground">
            Leads reached vs. converted after each touchpoint
          </p>
        </CardHeader>
        <CardContent>
          {seqLoading ? (
            <ChartSkeleton height={chartHeight} />
          ) : (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart
                data={sequenceFunnel?.steps ?? []}
                margin={{ top: 8, right: 24, left: 0, bottom: 4 }}
                barCategoryGap="30%"
                barGap={4}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3448" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  height={48}
                  tickFormatter={(v: string) => v.split(" – ")[0]}
                />
                <YAxis
                  tick={{ fill: "#94a3b8", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  {...TOOLTIP_STYLE}
                  formatter={(value: number, name: string) => [
                    value,
                    name === "reached" ? "Leads Reached" : "Converted After",
                  ]}
                />
                <Legend
                  formatter={(value) =>
                    value === "reached" ? "Leads Reached" : "Converted After"
                  }
                  wrapperStyle={{ color: "#94a3b8", fontSize: 13 }}
                />
                <Bar dataKey="reached" fill="#00c8f0" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="convertedAfter" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Section 5 — AI Coaching Insights */}
      <AIInsightsPanel />
    </div>
  );
}
