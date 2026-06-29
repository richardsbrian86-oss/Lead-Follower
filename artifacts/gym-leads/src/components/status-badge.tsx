import { LeadStatus } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";

export const statusConfig: Record<LeadStatus, { label: string; colorClass: string }> = {
  new: { label: "New", colorClass: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400" },
  contacted: { label: "Contacted", colorClass: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400" },
  interested: { label: "Interested", colorClass: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400" },
  won: { label: "Won", colorClass: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400" },
  lost: { label: "Lost", colorClass: "bg-zinc-100 text-zinc-800 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400" },
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
