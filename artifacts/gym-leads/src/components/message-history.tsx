import React from "react";
import { useGetLeadMessages, getGetLeadMessagesQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Mail, MessageSquare, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface MessageHistoryProps {
  leadId: number;
}

const statusIcon = {
  sent: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  failed: <XCircle className="w-4 h-4 text-destructive" />,
  pending: <Clock className="w-4 h-4 text-amber-500" />,
};

const statusLabel: Record<string, string> = {
  sent: "Sent",
  failed: "Failed",
  pending: "Pending",
};

export function MessageHistory({ leadId }: MessageHistoryProps) {
  const { data: messages, isLoading } = useGetLeadMessages(leadId, {
    query: { queryKey: getGetLeadMessagesQueryKey(leadId) },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="text-center py-8 border border-dashed rounded-lg bg-muted/30">
        <Mail className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No messages sent yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => (
        <div key={msg.id} className="rounded-lg border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {msg.channel === "email" ? (
                <Mail className="w-4 h-4 text-blue-500" />
              ) : (
                <MessageSquare className="w-4 h-4 text-purple-500" />
              )}
              <span className="text-sm font-semibold capitalize">{msg.channel}</span>
              {msg.sequenceStep !== null && msg.sequenceStep !== undefined && (
                <Badge variant="secondary" className="text-xs">
                  Step {msg.sequenceStep + 1}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {statusIcon[msg.status]}
              <span>{statusLabel[msg.status]}</span>
              {msg.sentAt && (
                <span className="ml-1">· {format(new Date(msg.sentAt), "MMM d, h:mm a")}</span>
              )}
            </div>
          </div>
          {msg.subject && (
            <p className="text-sm font-medium text-foreground">{msg.subject}</p>
          )}
          <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">{msg.body}</p>
        </div>
      ))}
    </div>
  );
}
