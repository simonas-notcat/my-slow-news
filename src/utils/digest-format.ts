/**
 * Digest Formatting Utilities
 *
 * Helper functions for generating readable digest markdown output.
 */

import type { ExtractedClaim } from "../types";

/**
 * Sanitizes text for safe markdown output
 * Escapes characters that could be interpreted as markdown/HTML
 */
export function sanitizeMarkdown(text: string): string {
  return text
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

/**
 * Validates and formats a date string (YYYY-MM-DD) as a human-readable date
 * e.g., "Saturday, December 27, 2025"
 * Returns the original string if invalid
 */
export function formatHumanDate(dateStr: string): string {
  // Validate YYYY-MM-DD format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  const date = new Date(dateStr + "T12:00:00Z"); // Noon UTC to avoid timezone issues

  // Check if date is valid
  if (isNaN(date.getTime())) {
    return dateStr;
  }

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Generates a URL-friendly slug from a title
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 50);
}

/**
 * Converts a claim triple to natural language
 * Uses simple sentence construction based on predicate type
 */
export function claimToNaturalLanguage(claim: ExtractedClaim): string {
  const subject = sanitizeMarkdown(claim.subject.replace(/-/g, " "));
  const predicate = claim.predicate.replace(/-/g, " ");
  const object = sanitizeMarkdown(claim.object.replace(/-/g, " "));
  const confidence = Math.round(claim.confidence * 100);

  // Build natural language sentence
  const sentence = `${subject} ${predicate} ${object}`;

  return `${sentence} *(${confidence}% confident)*`;
}
