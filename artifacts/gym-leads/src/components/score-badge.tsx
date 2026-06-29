import React from "react";
import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md";
}

export function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  const color =
    score >= 70
      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
      : score >= 40
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : "bg-red-100 text-red-600 border-red-200";

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
  if (score >= 70) return "text-emerald-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-500";
}
