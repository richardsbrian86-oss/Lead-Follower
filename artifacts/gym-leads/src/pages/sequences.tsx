import React, { useState } from "react";
import {
  useListSequenceTemplates,
  getListSequenceTemplatesQueryKey,
  useUpdateSequenceTemplate,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Save, CalendarClock, Loader2 } from "lucide-react";

const STEP_LABELS = ["Day 1 — First Touch", "Day 3 — Follow-up", "Day 7 — Value Nudge", "Day 14 — Final Check-in"];

export default function Sequences() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: templates, isLoading } = useListSequenceTemplates({
    query: { queryKey: getListSequenceTemplatesQueryKey() },
  });

  const update = useUpdateSequenceTemplate();
  const [edits, setEdits] = useState<Record<number, { delayDays: number; toneInstruction: string }>>({});
  const [saving, setSaving] = useState<number | null>(null);

  const getEdit = (step: number, field: "delayDays" | "toneInstruction") => {
    const tmpl = templates?.find((t) => t.step === step);
    if (edits[step]?.[field] !== undefined) return edits[step][field];
    return tmpl?.[field] ?? (field === "delayDays" ? 1 : "");
  };

  const handleSave = async (step: number) => {
    const data = edits[step];
    if (!data) return;
    setSaving(step);
    update.mutate(
      { step, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListSequenceTemplatesQueryKey() });
          setEdits((prev) => { const next = { ...prev }; delete next[step]; return next; });
          toast({ title: "Saved", description: `Step ${step + 1} template updated.` });
        },
        onError: () => {
          toast({ title: "Error", description: "Could not save template.", variant: "destructive" });
        },
        onSettled: () => setSaving(null),
      },
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Follow-up Sequences</h1>
        <p className="text-muted-foreground mt-1">
          Edit the timing and tone of each automated touchpoint sent to leads.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-52 w-full rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-4">
          {(templates ?? []).map((tmpl) => {
            const isDirty = !!edits[tmpl.step];
            return (
              <Card key={tmpl.step} className="border-none shadow-md">
                <CardHeader className="pb-3 bg-secondary/30 border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-primary" />
                    {STEP_LABELS[tmpl.step]}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="flex items-center gap-3">
                    <label className="text-sm font-medium text-muted-foreground w-24 shrink-0">
                      Send after
                    </label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={60}
                        className="w-20"
                        value={getEdit(tmpl.step, "delayDays") as number}
                        onChange={(e) =>
                          setEdits((prev) => ({
                            ...prev,
                            [tmpl.step]: {
                              delayDays: Number(e.target.value),
                              toneInstruction: (prev[tmpl.step]?.toneInstruction ?? tmpl.toneInstruction),
                            },
                          }))
                        }
                      />
                      <span className="text-sm text-muted-foreground">days from visit</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-muted-foreground">
                      Tone / Goal for AI
                    </label>
                    <Textarea
                      className="resize-none min-h-[80px]"
                      value={getEdit(tmpl.step, "toneInstruction") as string}
                      onChange={(e) =>
                        setEdits((prev) => ({
                          ...prev,
                          [tmpl.step]: {
                            delayDays: (prev[tmpl.step]?.delayDays ?? tmpl.delayDays),
                            toneInstruction: e.target.value,
                          },
                        }))
                      }
                      placeholder="Describe the goal and tone for this message..."
                    />
                  </div>
                  {isDirty && (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={() => handleSave(tmpl.step)}
                        disabled={saving === tmpl.step}
                      >
                        {saving === tmpl.step ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4 mr-2" />
                        )}
                        Save Changes
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
