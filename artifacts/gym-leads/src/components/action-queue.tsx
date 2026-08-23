import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetDashboardActionQueue,
  getGetDashboardActionQueueQueryKey,
  useUpdateLead,
  useCreateLeadEvent,
} from "@workspace/api-client-react";
import type { ActionItem, ActionQueue } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, Phone, MessageSquare, ArrowRight, ChevronDown, ChevronUp, AlertTriangle, RefreshCw, Clock, CheckCircle, X } from "lucide-react";
import { Link } from "wouter";
import { StatusBadge } from "@/components/status-badge";
import { ScoreBadge } from "@/components/score-badge";
import { SendMessageModal } from "@/components/send-message-modal";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useDismissedLeads } from "@/hooks/use-dismissed-leads";

function reasonColor(reason: string): { border: string; pill: string } {
  const r = reason.toLowerCase();
  if (r.includes("overdue")) return { border: "border-l-rose-500", pill: "bg-rose-500/20 text-rose-400" };
  if (r.includes("sequence")) return { border: "border-l-cyan-500", pill: "bg-cyan-500/20 text-cyan-400" };
  return { border: "border-l-amber-500", pill: "bg-amber-500/20 text-amber-400" };
}

function formatAge(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60_000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return hrs === 1 ? "1 hr ago" : `${hrs} hrs ago`;
}

interface ActionCardProps {
  item: ActionItem;
  onMarkContacted: (leadId: number) => void;
  isMarkingContacted: boolean;
  onDismiss: (leadId: number) => void;
}

interface DismissedActionCardProps {
  item: ActionItem;
  onUndo: (leadId: number) => void;
}
function ActionCard({ item, onMarkContacted, isMarkingContacted, onDismiss }: ActionCardProps) {
  const [msgOpen, setMsgOpen] = useState(false);
  const { border, pill } = reasonColor(item.primaryReason);
  const isInterested = item.status === "interested";
  const contactLabel = isInterested ? "Log contact" : "Contacted";

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
          <button
            onClick={() => onMarkContacted(item.leadId)}
            disabled={isMarkingContacted}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full text-xs font-medium transition-colors",
              "bg-secondary/60 hover:bg-emerald-500/20 hover:text-emerald-400",
              isMarkingContacted && "opacity-50 cursor-not-allowed",
            )}
            title={`✓ ${contactLabel}`}
          >
            <CheckCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{contactLabel}</span>
          </button>
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
          <button
            onClick={() => onDismiss(item.leadId)}
            className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary/60 hover:bg-muted hover:text-muted-foreground transition-colors"
            title="Dismiss for today"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <SendMessageModal leadId={item.leadId} open={msgOpen} onClose={() => setMsgOpen(false)} onDismiss={onDismiss} />
    </>
  );
}

export function ActionQueue() {
  const [collapsed, setCollapsed] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [markingIds, setMarkingIds] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateLead = useUpdateLead();
  const createEvent = useCreateLeadEvent();
  const { dismissed, dismiss, undoDismiss } = useDismissedLeads();

  const { data, isLoading, isError, dataUpdatedAt, refetch } = useGetDashboardActionQueue(undefined, {
    query: {
      queryKey: getGetDashboardActionQueueQueryKey(),
      refetchInterval: 60_000,
    },
  });

  const allActions = data?.actions ?? [];
  const actions = allActions.filter((a) => !dismissed.has(a.leadId));
  const dismissedActions = allActions.filter((a) => dismissed.has(a.leadId));
  const count = actions.length;
  const hasStaleData = isError && data !== undefined;

  async function handleRetry() {
    setIsRetrying(true);
    try {
      await refetch();
    } finally {
      setIsRetrying(false);
    }
  }

  const handleMarkContacted = (leadId: number) => {
    const item = actions.find((a) => a.leadId === leadId);
    if (!item) return;

    setMarkingIds((prev) => new Set(prev).add(leadId));

    const optimisticallyRemove = () => {
      queryClient.setQueryData<ActionQueue>(
        getGetDashboardActionQueueQueryKey(),
        (old) => old ? { ...old, actions: old.actions.filter((a) => a.leadId !== leadId) } : old,
      );
    };

    if (item.status === "interested") {
      createEvent.mutate(
        { id: leadId, data: { type: "note", note: "Contacted" } },
        {
          onSuccess: () => {
            optimisticallyRemove();
            dismiss(leadId);
            toast({ title: "Contact logged", description: `${item.name} marked as contacted.` });
          },
          onError: () => {
            toast({ title: "Failed to log contact", description: "Please try again.", variant: "destructive" });
          },
          onSettled: () => {
            setMarkingIds((prev) => { const s = new Set(prev); s.delete(leadId); return s; });
          },
        },
      );
    } else {
      updateLead.mutate(
        { id: leadId, data: { status: "contacted" } },
        {
          onSuccess: () => {
            optimisticallyRemove();
            dismiss(leadId);
            toast({ title: "Marked as contacted", description: `${item.name} moved to contacted.` });
          },
          onError: () => {
            toast({ title: "Failed to update lead", description: "Please try again.", variant: "destructive" });
          },
          onSettled: () => {
            setMarkingIds((prev) => { const s = new Set(prev); s.delete(leadId); return s; });
          },
        },
      );
    }
  };

  const dismissedSection = dismissed.size > 0 && (
    <div className="mt-5 pt-4 border-t border-border/50" data-testid="dismissed-actions">
      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => setShowDismissed((show) => !show)}
        aria-expanded={showDismissed}
      >
        {showDismissed ? "Hide dismissed" : "Show dismissed"} ({dismissed.size})
      </button>
      {showDismissed && (
        <div className="space-y-3 mt-3">
          {dismissedActions.length > 0 ? (
            dismissedActions.map((item) => (
              <DismissedActionCard key={item.leadId} item={item} onUndo={undoDismiss} />
            ))
          ) : (
            <p className="text-xs text-muted-foreground py-2">
              Dismissed leads are no longer in today&apos;s action queue.
            </p>
          )}
        </div>
      )}
    </div>
  );

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
          {isError && (
            <div
              className="flex items-start gap-3 mb-4 px-3 py-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400"
              data-testid="action-queue-error-banner"
            >
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug">
                  {hasStaleData
                    ? "Couldn't refresh — showing last known data"
                    : "Failed to load the action queue"}
                </p>
                {hasStaleData && dataUpdatedAt > 0 && (
                  <p className="text-xs mt-0.5 flex items-center gap-1 text-rose-400/70">
                    <Clock className="w-3 h-3" />
                    Last updated {formatAge(dataUpdatedAt)}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 h-7 px-2 text-rose-400 hover:text-rose-300 hover:bg-rose-500/20"
                onClick={(e) => { e.stopPropagation(); handleRetry(); }}
                disabled={isRetrying}
                data-testid="action-queue-retry"
              >
                <RefreshCw className={cn("w-3.5 h-3.5 mr-1", isRetrying && "animate-spin")} />
                {isRetrying ? "Retrying…" : "Retry"}
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : !isError && count === 0 ? (
            <>
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <span className="text-3xl mb-2">🎯</span>
                <p className="text-muted-foreground font-medium">All caught up for today</p>
                <p className="text-xs text-muted-foreground mt-1">No urgent actions right now — check back later.</p>
              </div>
              {dismissedSection}
            </>
          ) : isError && !hasStaleData ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-muted-foreground text-sm">No data available. Use Retry above to try again.</p>
            </div>
          ) : (
            <>
              <div className={cn("space-y-3", hasStaleData && "opacity-60")} data-testid="action-queue-list">
                {actions.map((item) => (
                  <ActionCard
                    key={item.leadId}
                    item={item}
                    onMarkContacted={handleMarkContacted}
                    isMarkingContacted={markingIds.has(item.leadId)}
                    onDismiss={dismiss}
                  />
                ))}
              </div>
              {dismissedSection}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function DismissedActionCard({ item, onUndo }: DismissedActionCardProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-lg bg-muted/20 border border-border/50 opacity-70">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="shrink-0 grayscale">
          <ScoreBadge score={item.score} size="md" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-semibold text-sm truncate">{item.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
              Dismissed
            </span>
            <StatusBadge status={item.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{item.primaryReason}</span>
            {item.daysSinceContact !== null && item.daysSinceContact !== undefined && (
              <span className="text-xs text-muted-foreground">
                {item.daysSinceContact === 0 ? "Contacted today" : `${item.daysSinceContact}d since contact`}
              </span>
            )}
          </div>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 self-end sm:self-auto"
        onClick={() => onUndo(item.leadId)}
      >
        Undo
      </Button>
    </div>
  );
}
