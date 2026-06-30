import { LeadStatus } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

export const statusConfig: Record<LeadStatus, { label: string; colorClass: string }> = {
  new:        { label: "New",        colorClass: "bg-sky-500/15 text-sky-300 border-sky-500/40" },
  contacted:  { label: "Contacted",  colorClass: "bg-amber-500/15 text-amber-300 border-amber-500/40" },
  interested: { label: "Interested", colorClass: "bg-violet-500/15 text-violet-300 border-violet-500/40" },
  won:        { label: "Won",        colorClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" },
  lost:       { label: "Lost",       colorClass: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
};

interface StatusBadgeProps {
  status: LeadStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.new;
  return (
    <Badge variant="outline" className={`font-medium ${config.colorClass}`}>
      {config.label}
    </Badge>
  );
}
