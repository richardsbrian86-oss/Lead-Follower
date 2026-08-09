import React, { useState } from "react";
import {
  useDraftLeadMessage,
  useSendLeadMessage,
  getGetLeadMessagesQueryKey,
  getGetDashboardActionQueueQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { dismissLeadForToday } from "@/hooks/use-dismissed-leads";
import { Sparkles, Send, Loader2 } from "lucide-react";

interface SendMessageModalProps {
  leadId: number;
  open: boolean;
  onClose: () => void;
  /** Called with leadId on a successful send so the caller can update live dismiss state. */
  onDismiss?: (leadId: number) => void;
}

type Channel = "email" | "sms";

export function SendMessageModal({ leadId, open, onClose, onDismiss }: SendMessageModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<Channel>("email");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const draftMutation = useDraftLeadMessage();
  const sendMutation = useSendLeadMessage();

  const handleDraft = () => {
    draftMutation.mutate(
      { id: leadId, data: { channel } },
      {
        onSuccess: (draft) => {
          setBody(draft.body);
          if (draft.subject) setSubject(draft.subject);
          toast({ title: "Draft generated", description: "AI-drafted message ready to edit." });
        },
        onError: () => {
          toast({ title: "Draft failed", description: "Could not generate a draft.", variant: "destructive" });
        },
      },
    );
  };

  const handleSend = () => {
    if (!body.trim()) return;
    sendMutation.mutate(
      {
        id: leadId,
        data: { channel, body, subject: channel === "email" ? subject : undefined },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetLeadMessagesQueryKey(leadId) });
          queryClient.invalidateQueries({ queryKey: getGetDashboardActionQueueQueryKey() });
          // Persist to sessionStorage so any other page that mounts the hook picks it up.
          dismissLeadForToday(leadId);
          // Also call the live React-state dismiss if available (e.g. when opened from ActionQueue)
          // so the card disappears immediately without waiting for a re-mount.
          onDismiss?.(leadId);
          toast({ title: "Message sent!", description: `${channel === "email" ? "Email" : "SMS"} delivered successfully.` });
          setSubject("");
          setBody("");
          onClose();
        },
        onError: () => {
          toast({ title: "Send failed", description: "Message could not be sent.", variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            Send Message
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="flex gap-2 items-center">
            <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDraft}
              disabled={draftMutation.isPending}
              className="flex items-center gap-2"
            >
              {draftMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-primary" />
              )}
              AI Draft
            </Button>
          </div>

          {channel === "email" && (
            <Input
              placeholder="Subject line..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          )}

          <Textarea
            placeholder={channel === "email" ? "Write or AI-draft your email..." : "Write or AI-draft your SMS (max 160 chars)..."}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[140px] resize-none"
            maxLength={channel === "sms" ? 160 : undefined}
          />

          {channel === "sms" && (
            <p className="text-xs text-muted-foreground text-right">{body.length}/160</p>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSend} disabled={!body.trim() || sendMutation.isPending}>
              {sendMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
