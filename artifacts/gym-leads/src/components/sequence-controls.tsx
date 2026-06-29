import React from "react";
import {
  useGetLeadSequence,
  getGetLeadSequenceQueryKey,
  usePauseLeadSequence,
  useResumeLeadSequence,
  useCancelLeadSequence,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Play, Pause, X, CalendarClock, Loader2 } from "lucide-react";

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
  const cancel = useCancelLeadSequence();

  if (isLoading) {
    return <div className="h-8 w-full rounded bg-muted animate-pulse" />;
  }

  if (!sequence) {
    return (
      <div className="text-xs text-muted-foreground">No follow-up sequence active.</div>
    );
  }

  const statusColor = sequence.cancelled
    ? "bg-muted text-muted-foreground"
    : sequence.paused
      ? "bg-amber-100 text-amber-700"
      : "bg-emerald-100 text-emerald-700";

  const statusLabel = sequence.cancelled
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

      {!sequence.cancelled && sequence.nextSendAt && !sequence.paused && (
        <p className="text-xs text-muted-foreground">
          Next message: {format(new Date(sequence.nextSendAt), "PPP")}
        </p>
      )}

      {!sequence.cancelled && (
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
