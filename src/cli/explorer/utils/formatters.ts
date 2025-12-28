import type { UserStance, FilterState } from "../types.js";

export function getStanceIndicator(stance?: UserStance): {
  symbol: string;
  color: string;
  label: string;
} {
  switch (stance) {
    case "agrees":
      return { symbol: "✓", color: "green", label: "agreed" };
    case "disagrees":
      return { symbol: "✗", color: "red", label: "disagreed" };
    case "neutral":
      return { symbol: "~", color: "yellow", label: "neutral" };
    case "uncertain":
      return { symbol: "?", color: "blue", label: "uncertain" };
    default:
      return { symbol: "○", color: "gray", label: "unrated" };
  }
}

export function formatConfidence(confidence: number): string {
  const percentage = Math.round(confidence * 100);
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  return `${"█".repeat(filled)}${"░".repeat(empty)} ${percentage}%`;
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeDate(date: Date | string): string {
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
  } else {
    parts.push("predicate:all");
  }

  if (filters.subject) {
    parts.push(`subject:${filters.subject}`);
  } else {
    parts.push("subject:all");
  }

  if (filters.days) {
    parts.push(`days:${filters.days}`);
  } else {
    parts.push("days:all");
  }

  if (filters.stanceFilter !== "all") {
    parts.push(`stance:${filters.stanceFilter}`);
  }

  return parts.join("  ");
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + "…";
}
