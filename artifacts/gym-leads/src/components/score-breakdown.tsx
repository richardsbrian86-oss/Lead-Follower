import React from "react";
import { useGetLeadScore, getGetLeadScoreQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp } from "lucide-react";
import { ScoreBadge, scoreColor } from "@/components/score-badge";

interface ScoreBreakdownProps {
  leadId: number;
}

const FACTOR_LABELS: Record<string, { label: string; max: number; description: string }> = {
  visitRecency: { label: "Visit Recency", max: 30, description: "How recently they visited" },
  status: { label: "Pipeline Stage", max: 25, description: "Current lead status" },
  activity: { label: "Activity Logged", max: 20, description: "Notes & events recorded" },
  outreachEngagement: { label: "Outreach Success", max: 15, description: "Messages delivered vs failed" },
  sequenceProgress: { label: "Sequence Progress", max: 10, description: "Automated follow-up steps completed" },
};

const FACTOR_ORDER = ["visitRecency", "status", "activity", "outreachEngagement", "sequenceProgress"];

export function ScoreBreakdown({ leadId }: ScoreBreakdownProps) {
  const { data: scoreData, isLoading } = useGetLeadScore(leadId, {
    query: {
      queryKey: getGetLeadScoreQueryKey(leadId),
      retry: false,
    },
  });

  if (isLoading) return <Skeleton className="h-40 w-full rounded-lg" />;
  if (!scoreData) return null;

  return (
    <Card className="border-none shadow-md">
      <CardHeader className="pb-3 bg-secondary/30 border-b">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Predictive Score
          </div>
          <ScoreBadge score={scoreData.score} />
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        {FACTOR_ORDER.map((key) => {
          const meta = FACTOR_LABELS[key];
          const pts = (scoreData.factors as unknown as Record<string, number>)[key] ?? 0;
          const pct = meta.max > 0 ? (pts / meta.max) * 100 : 0;
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">{meta.label}</span>
                <span className={`font-bold ${scoreColor(pts / meta.max * 100)}`}>
                  +{pts} / {meta.max}
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all bg-primary"
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
