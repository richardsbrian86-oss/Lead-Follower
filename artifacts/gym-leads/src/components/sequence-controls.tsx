import React from "react";
import {
  useGetLeadSequence,
  getGetLeadSequenceQueryKey,
  usePauseLeadSequence,
  useResumeLeadSequence,
  useRetryLeadSequence,
  useCancelLeadSequence,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Play, Pause, X, CalendarClock, Loader2, AlertTriangle, RotateCcw } from "lucide-react";

interface SequenceControlsProps {
  leadId: number;
}

export function SequenceControls({ leadId }: SequenceControlsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: sequence, isLoading } = useGetLeadSequence(leadId, {
    query: {
      queryKey: getGetLeadSequenceQueryKey(leadId),
      retry: false,
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetLeadSequenceQueryKey(leadId) });

  const pause = usePauseLeadSequence();
  const resume = useResumeLeadSequence();
  const retry = useRetryLeadSequence();
  const cancel = useCancelLeadSequence();

  if (isLoading) {
    return <div className="h-8 w-full rounded bg-muted animate-pulse" />;
  }

  if (!sequence) {
    return (
      <div className="text-xs text-muted-foreground">No follow-up sequence active.</div>
    );
  }

  const statusColor = sequence.status === "failed"
    ? "bg-red-100 text-red-700"
    : sequence.cancelled
    ? "bg-muted text-muted-foreground"
    : sequence.paused
      ? "bg-amber-100 text-amber-700"
      : "bg-emerald-100 text-emerald-700";

  const statusLabel = sequence.status === "failed"
    ? "Needs attention"
    : sequence.cancelled
    ? "Cancelled"
    : sequence.paused
      ? "Paused"
      : `Active — Step ${sequence.currentStep + 1} of 4`;

  return (
    <div className="rounded-lg border bg-secondary/20 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Follow-up Sequence</span>
        </div>
        <Badge className={`text-xs font-medium border-0 ${statusColor}`}>{statusLabel}</Badge>
      </div>

      {sequence.status === "failed" && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Follow-up could not be completed</p>
              <p className="mt-1">{sequence.failureReason || "The scheduler stopped before this step finished."}</p>
              <p className="mt-2 text-red-700">Retry resumes at step {sequence.currentStep + 1}. Messages already sent or in progress will not be duplicated.</p>
            </div>
          </div>
          <Button
            size="sm"
            className="mt-3 w-full"
            disabled={retry.isPending}
            onClick={() =>
              retry.mutate(
                { id: leadId },
                {
                  onSuccess: () => {
                    invalidate();
                    toast({ title: "Follow-up queued", description: `Step ${sequence.currentStep + 1} will resume without duplicating sent messages.` });
                  },
                  onError: () => toast({ title: "Error", description: "Could not retry the follow-up.", variant: "destructive" }),
                },
              )
            }
          >
            {retry.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}
            Retry follow-up
          </Button>
        </div>
      )}

      {!sequence.cancelled && sequence.nextSendAt && !sequence.paused && (
        <p className="text-xs text-muted-foreground">
          Next message: {format(new Date(sequence.nextSendAt), "PPP")}
        </p>
      )}

      {!sequence.cancelled && sequence.status !== "failed" && (
        <div className="flex gap-2">
          {sequence.paused ? (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={resume.isPending}
              onClick={() =>
                resume.mutate({ id: leadId }, { onSuccess: invalidate, onError: () => toast({ title: "Error", description: "Could not resume.", variant: "destructive" }) })
              }
            >
              {resume.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
              Resume
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={pause.isPending}
              onClick={() =>
                pause.mutate({ id: leadId }, { onSuccess: invalidate, onError: () => toast({ title: "Error", description: "Could not pause.", variant: "destructive" }) })
              }
            >
              {pause.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Pause className="w-3.5 h-3.5 mr-1.5" />}
              Pause
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate({ id: leadId }, { onSuccess: invalidate, onError: () => toast({ title: "Error", description: "Could not cancel.", variant: "destructive" }) })
            }
          >
            {cancel.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          </Button>
        </div>
      )}
    </div>
  );
}
