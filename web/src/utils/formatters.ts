import type { UserStance, FilterState } from "../types";

export function getStanceIndicator(stance?: UserStance): {
  symbol: string;
  colorClass: string;
  label: string;
} {
  switch (stance) {
    case "agrees":
      return { symbol: "✓", colorClass: "text-green-600", label: "agreed" };
    case "disagrees":
      return { symbol: "✗", colorClass: "text-red-600", label: "disagreed" };
    case "neutral":
      return { symbol: "~", colorClass: "text-yellow-600", label: "neutral" };
    case "uncertain":
      return { symbol: "?", colorClass: "text-blue-600", label: "uncertain" };
    default:
      return { symbol: "○", colorClass: "text-gray-400", label: "unrated" };
  }
}

export function formatConfidence(confidence: number): {
  percentage: number;
  barWidth: string;
} {
  const percentage = Math.round(confidence * 100);
  return { percentage, barWidth: `${percentage}%` };
}

export function formatDate(date?: Date | string): string {
  if (!date) return "Unknown date";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeDate(date?: Date | string): string {
  if (!date) return "unknown";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

export function formatFiltersDisplay(filters: FilterState): string {
  const parts: string[] = [];

  if (filters.predicate) {
    parts.push(`predicate:${filters.predicate}`);
  }
  if (filters.subject) {
    parts.push(`subject:${filters.subject}`);
  }
  if (filters.days) {
    parts.push(`${filters.days} days`);
  }
  if (filters.stanceFilter !== "all") {
    parts.push(`stance:${filters.stanceFilter}`);
  }

  return parts.length > 0 ? parts.join(" · ") : "all claims";
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + "…";
}
