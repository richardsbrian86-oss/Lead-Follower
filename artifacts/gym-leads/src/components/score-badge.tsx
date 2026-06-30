import React from "react";
import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md";
}

export function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  const color =
    score >= 70
      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
      : score >= 40
        ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
        : "bg-red-500/20 text-red-400 border-red-500/40";

  const sizeClass = size === "sm" ? "text-xs px-1.5 py-0.5 min-w-[2rem]" : "text-sm px-2 py-1 min-w-[2.5rem]";

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border font-bold tabular-nums",
        color,
        sizeClass,
      )}
      title={`Lead score: ${score}/100`}
    >
      {score}
    </span>
  );
}

export function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-300";
  if (score >= 40) return "text-amber-300";
  return "text-red-400";
}
