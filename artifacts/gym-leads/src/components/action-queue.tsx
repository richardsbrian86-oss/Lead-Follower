import React, { useState } from "react";
import { useGetDashboardActionQueue, getGetDashboardActionQueueQueryKey } from "@workspace/api-client-react";
import type { ActionItem } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, Phone, MessageSquare, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { ScoreBadge } from "@/components/score-badge";
import { SendMessageModal } from "@/components/send-message-modal";
import { cn } from "@/lib/utils";

function reasonColor(reason: string): { border: string; pill: string } {
  const r = reason.toLowerCase();
  if (r.includes("overdue")) return { border: "border-l-rose-500", pill: "bg-rose-500/20 text-rose-400" };
  if (r.includes("sequence")) return { border: "border-l-cyan-500", pill: "bg-cyan-500/20 text-cyan-400" };
  return { border: "border-l-amber-500", pill: "bg-amber-500/20 text-amber-400" };
}

interface ActionCardProps {
  item: ActionItem;
}

function ActionCard({ item }: ActionCardProps) {
  const [msgOpen, setMsgOpen] = useState(false);
  const { border, pill } = reasonColor(item.primaryReason);

  return (
    <>
      <div
        className={cn(
          "flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg bg-secondary/20 hover:bg-secondary/40 transition-colors border-l-4",
          border,
        )}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="shrink-0">
            <ScoreBadge score={item.score} size="md" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-semibold text-sm truncate">{item.name}</span>
              <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium shrink-0", pill)}>
                {item.primaryReason}
              </span>
              <StatusBadge status={item.status} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {item.secondaryReasons.map((r) => {
                const { pill: sp } = reasonColor(r);
                return (
                  <span key={r} className={cn("text-xs px-1.5 py-0.5 rounded font-medium opacity-75", sp)}>
                    {r}
                  </span>
                );
              })}
              {item.daysSinceContact !== null && item.daysSinceContact !== undefined && (
                <span className="text-xs text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
                  {item.daysSinceContact === 0 ? "Contacted today" : `${item.daysSinceContact}d since contact`}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <a
            href={`tel:${item.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary/60 hover:bg-emerald-500/20 hover:text-emerald-400 transition-colors"
            title={`Call ${item.name}`}
          >
            <Phone className="w-4 h-4" />
          </a>
          <button
            onClick={() => setMsgOpen(true)}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary/60 hover:bg-cyan-500/20 hover:text-cyan-400 transition-colors"
            title={`Message ${item.name}`}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
          <Link href={`/leads/${item.leadId}`}>
            <button
              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary/60 hover:bg-primary/20 hover:text-primary transition-colors"
              title="View lead"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </Link>
        </div>
      </div>

      <SendMessageModal leadId={item.leadId} open={msgOpen} onClose={() => setMsgOpen(false)} />
    </>
  );
}

export function ActionQueue() {
  const [collapsed, setCollapsed] = useState(false);

  const { data, isLoading } = useGetDashboardActionQueue({
    query: {
      queryKey: getGetDashboardActionQueueQueryKey(),
      refetchInterval: 60_000,
    },
  });

  const actions = data?.actions ?? [];
  const count = actions.length;

  return (
    <Card className="border-none shadow-md">
      <CardHeader
        className="flex flex-row items-center justify-between pb-3 bg-secondary/30 border-b cursor-pointer select-none"
        onClick={() => count === 0 ? undefined : setCollapsed((c) => !c)}
      >
        <CardTitle className="text-xl flex items-center gap-2">
          <Zap className="w-5 h-5 text-cyan-400" />
          Today&apos;s Actions
          {isLoading ? (
            <Skeleton className="h-5 w-6 rounded-full" />
          ) : (
            <Badge
              className={cn(
                "ml-1 text-xs font-bold",
                count > 0 ? "bg-rose-500 hover:bg-rose-600 text-white" : "bg-muted text-muted-foreground",
              )}
            >
              {count}
            </Badge>
          )}
        </CardTitle>
        {count > 0 && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={(e) => { e.stopPropagation(); setCollapsed((c) => !c); }}>
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </Button>
        )}
      </CardHeader>

      {!collapsed && (
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : count === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <span className="text-3xl mb-2">🎯</span>
              <p className="text-muted-foreground font-medium">All caught up for today</p>
              <p className="text-xs text-muted-foreground mt-1">No urgent actions right now — check back later.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {actions.map((item) => (
                <ActionCard key={item.leadId} item={item} />
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
