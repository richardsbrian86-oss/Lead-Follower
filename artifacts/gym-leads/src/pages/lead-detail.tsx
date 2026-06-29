import React, { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import {
  useGetLead,
  getGetLeadQueryKey,
  useUpdateLead,
  useDeleteLead,
  useCreateLeadEvent,
  getListLeadsQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetLeadSequenceQueryKey,
  useCancelLeadSequence,
  LeadStatus,
  LeadWithEvents,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  Mail,
  Phone,
  Calendar,
  Clock,
  Trash2,
  Send,
  MessageSquare,
  Activity,
  Inbox,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { statusConfig, StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SendMessageModal } from "@/components/send-message-modal";
import { MessageHistory } from "@/components/message-history";
import { SequenceControls } from "@/components/sequence-controls";
import { ScoreBreakdown } from "@/components/score-breakdown";

export default function LeadDetail() {
  const [, params] = useRoute("/leads/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [noteText, setNoteText] = useState("");
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"timeline" | "messages">("timeline");

  const { data: lead, isLoading, isError } = useGetLead(id, {
    query: {
      enabled: !!id,
      queryKey: getGetLeadQueryKey(id),
    },
  });

  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();
  const createEvent = useCreateLeadEvent();
  const cancelSequence = useCancelLeadSequence();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-[300px] col-span-1" />
          <Skeleton className="h-[500px] col-span-2" />
        </div>
      </div>
    );
  }

  if (isError || !lead) {
    return (
      <div className="p-8 text-center bg-destructive/10 rounded-lg text-destructive">
        <h2 className="text-xl font-bold mb-2">Lead not found</h2>
        <Button asChild variant="outline">
          <Link href="/leads">Back to Leads</Link>
        </Button>
      </div>
    );
  }

  const handleStatusChange = (newStatus: LeadStatus) => {
    updateLead.mutate(
      { id, data: { status: newStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetLeadQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          // Auto-cancel sequence when lead is marked Won
          if (newStatus === "won") {
            cancelSequence.mutate(
              { id },
              {
                onSuccess: () => {
                  queryClient.invalidateQueries({ queryKey: getGetLeadSequenceQueryKey(id) });
                },
                onError: () => {}, // sequence may not exist, ignore
              },
            );
          }
          toast({ title: "Status Updated", description: `Lead marked as ${statusConfig[newStatus].label}` });
        },
      },
    );
  };

  const handleDelete = () => {
    deleteLead.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({ title: "Lead Deleted", description: "The prospect was removed." });
          setLocation("/leads");
        },
      },
    );
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;

    createEvent.mutate(
      {
        id,
        data: {
          type: "note",
          note: noteText,
        },
      },
      {
        onSuccess: (newEvent) => {
          setNoteText("");
          queryClient.setQueryData(getGetLeadQueryKey(id), (old: LeadWithEvents | undefined) => {
            if (!old) return old;
            return {
              ...old,
              events: [newEvent, ...old.events].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
              ),
            };
          });
          toast({ title: "Note Added", description: "Successfully added to timeline." });
        },
      },
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button asChild variant="ghost" size="icon" className="rounded-full">
            <Link href="/leads">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">{lead.name}</h1>
            <p className="text-muted-foreground mt-1">Lead Profile</p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2 shadow-sm"
            onClick={() => setSendModalOpen(true)}
          >
            <Send className="w-4 h-4" />
            Send Message
          </Button>

          <Select value={lead.status} onValueChange={(val) => handleStatusChange(val as LeadStatus)}>
            <SelectTrigger className="w-full sm:w-48 bg-background border-primary/20 shadow-sm focus:ring-primary font-semibold">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(statusConfig).map(([key, conf]) => (
                <SelectItem key={key} value={key} className="font-medium">
                  {conf.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="icon" className="shadow-sm">
                <Trash2 className="w-4 h-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the lead
                  and all associated timeline events.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete Lead
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-1 space-y-6">
          <Card className="border-none shadow-md">
            <CardHeader className="bg-secondary/30 border-b pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-2 bg-primary/10 rounded-md text-primary">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Email</p>
                  <a href={`mailto:${lead.email}`} className="font-semibold text-foreground hover:text-primary transition-colors">
                    {lead.email}
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-2 bg-primary/10 rounded-md text-primary">
                  <Phone className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Phone</p>
                  <a href={`tel:${lead.phone}`} className="font-semibold text-foreground hover:text-primary transition-colors">
                    {lead.phone}
                  </a>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-2 bg-primary/10 rounded-md text-primary">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Visit Date</p>
                  <p className="font-semibold text-foreground">
                    {format(new Date(lead.visitDate), "PPP")}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-2 bg-primary/10 rounded-md text-primary">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Created On</p>
                  <p className="font-semibold text-foreground">
                    {format(new Date(lead.createdAt), "PPP")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {lead.notes && (
            <Card className="border-none shadow-md bg-secondary/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Initial Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap font-medium">{lead.notes}</p>
              </CardContent>
            </Card>
          )}

          <SequenceControls leadId={id} />

          <ScoreBreakdown leadId={id} />
        </div>

        <div className="col-span-1 lg:col-span-2 space-y-6">
          <Card className="border-none shadow-md h-full flex flex-col">
            <CardHeader className="border-b pb-0">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab("timeline")}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                    activeTab === "timeline"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <MessageSquare className="w-4 h-4" />
                  Activity Timeline
                </button>
                <button
                  onClick={() => setActiveTab("messages")}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                    activeTab === "messages"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Inbox className="w-4 h-4" />
                  Sent Messages
                </button>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col pt-6 p-0">
              {activeTab === "timeline" ? (
                <>
                  <div className="flex-1 overflow-auto p-6 space-y-6">
                    {lead.events.length === 0 ? (
                      <div className="text-center p-8 border border-dashed rounded-lg bg-muted/50">
                        <p className="text-muted-foreground font-medium">No activity recorded yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-border">
                        {lead.events.map((event) => (
                          <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                            <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-card bg-primary text-primary-foreground shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                              {event.type === "status_change" ? <Activity className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                            </div>
                            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border bg-card shadow-sm">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-sm text-primary uppercase tracking-wider">{event.type.replace("_", " ")}</span>
                                <span className="text-xs text-muted-foreground font-medium">
                                  {format(new Date(event.createdAt), "MMM d, h:mm a")}
                                </span>
                              </div>
                              {event.note && (
                                <p className="text-sm mt-2 font-medium text-foreground whitespace-pre-wrap">{event.note}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t bg-secondary/10 mt-auto">
                    <form onSubmit={handleAddNote} className="flex gap-2">
                      <Textarea
                        placeholder="Log a call, note, or follow-up..."
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        className="min-h-[60px] resize-none bg-background shadow-inner"
                      />
                      <Button
                        type="submit"
                        className="h-auto shrink-0 shadow-md"
                        disabled={!noteText.trim() || createEvent.isPending}
                      >
                        {createEvent.isPending ? (
                          "Saving..."
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Save
                          </>
                        )}
                      </Button>
                    </form>
                  </div>
                </>
              ) : (
                <div className="p-6">
                  <MessageHistory leadId={id} />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <SendMessageModal
        leadId={id}
        open={sendModalOpen}
        onClose={() => setSendModalOpen(false)}
      />
    </div>
  );
}
