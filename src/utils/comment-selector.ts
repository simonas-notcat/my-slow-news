/**
 * Diverse Comment Selection
 *
 * Selects comments that maximize viewpoint diversity rather than just picking
 * top-scored comments. This ensures summaries capture contrarian views,
 * discussion starters, and controversial perspectives.
 */

import type { RedditComment } from "../types";

export interface CommentSelectionOptions {
  /** Weight for top-scored comments (default: 0.4) */
  topScoredWeight?: number;
  /** Weight for most replied-to comments (default: 0.2) */
  repliedToWeight?: number;
  /** Weight for controversial comments (default: 0.2) */
  controversialWeight?: number;
  /** Weight for contrarian/low-score but substantive comments (default: 0.2) */
  contrarianWeight?: number;
  /** Minimum body length to consider (default: 50) */
  minBodyLength?: number;
}

interface ScoredComment {
  comment: RedditComment;
  diversityScore: number;
  category: "top" | "replied" | "controversial" | "contrarian";
}

/**
 * Calculates reply counts for each comment
 */
function calculateReplyCounts(
  comments: RedditComment[]
): Map<string, number> {
  const replyCounts = new Map<string, number>();

  // Initialize all comments with 0 replies
  for (const comment of comments) {
    replyCounts.set(comment.id, 0);
  }

  // Count replies (parent_id format: t1_xxxxx for comments)
  for (const comment of comments) {
    const parentId = comment.parent_id.replace(/^t[13]_/, "");
    const currentCount = replyCounts.get(parentId) || 0;
    replyCounts.set(parentId, currentCount + 1);
  }

  return replyCounts;
}

/**
 * Detects if a comment is likely controversial based on content
 */
function hasControversialIndicators(body: string): boolean {
  const lowerBody = body.toLowerCase();
  const indicators = [
    "disagree",
    "wrong",
    "incorrect",
    "actually,",
    "no,",
    "but ",
    "however",
    "false",
    "misleading",
    "unpopular opinion",
    "devil's advocate",
    "not true",
    "that's not",
    "i'd argue",
    "counterpoint",
  ];
  return indicators.some((indicator) => lowerBody.includes(indicator));
}

/**
 * Calculates score variance among comments to detect controversial discussions
 */
function calculateScoreVariance(comments: RedditComment[]): number {
  if (comments.length === 0) return 0;
  const scores = comments.map((c) => c.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const squaredDiffs = scores.map((s) => Math.pow(s - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * Selects diverse comments that represent multiple viewpoints
 */
export function selectDiverseComments(
  comments: RedditComment[],
  count: number,
  options: CommentSelectionOptions = {}
): RedditComment[] {
  const {
    topScoredWeight = 0.4,
    repliedToWeight = 0.2,
    controversialWeight = 0.2,
    contrarianWeight = 0.2,
    minBodyLength = 50,
  } = options;

  // Filter out short/low-quality comments
  const substantiveComments = comments.filter(
    (c) => c.body.length >= minBodyLength && c.author !== "[deleted]"
  );

  if (substantiveComments.length === 0) {
    return comments.slice(0, count);
  }

  if (substantiveComments.length <= count) {
    return substantiveComments;
  }

  const replyCounts = calculateReplyCounts(comments);
  const scoreVariance = calculateScoreVariance(substantiveComments);
  const avgScore =
    substantiveComments.reduce((a, b) => a + b.score, 0) /
    substantiveComments.length;

  // Calculate allocation for each category
  const topCount = Math.ceil(count * topScoredWeight);
  const repliedCount = Math.ceil(count * repliedToWeight);
  const controversialCount = Math.ceil(count * controversialWeight);
  const contrarianCount = count - topCount - repliedCount - controversialCount;

  const selected: RedditComment[] = [];
  const selectedIds = new Set<string>();

  // Helper to add comment if not already selected
  const addIfNew = (comment: RedditComment): boolean => {
    if (selectedIds.has(comment.id)) return false;
    selectedIds.add(comment.id);
    selected.push(comment);
    return true;
  };

  // 1. Top scored comments (consensus views)
  const byScore = [...substantiveComments].sort((a, b) => b.score - a.score);
  for (const comment of byScore) {
    if (selected.length >= topCount) break;
    addIfNew(comment);
  }

  // 2. Most replied-to comments (discussion starters)
  const byReplies = [...substantiveComments].sort(
    (a, b) => (replyCounts.get(b.id) || 0) - (replyCounts.get(a.id) || 0)
  );
  for (const comment of byReplies) {
    if (selected.length >= topCount + repliedCount) break;
    addIfNew(comment);
  }

  // 3. Controversial comments (mixed reactions, debate indicators)
  const controversial = substantiveComments
    .filter((c) => hasControversialIndicators(c.body))
    .sort((a, b) => {
      // Prefer comments with moderate scores (not too high, not too low)
      const aDistance = Math.abs(a.score - avgScore);
      const bDistance = Math.abs(b.score - avgScore);
      return aDistance - bDistance;
    });

  for (const comment of controversial) {
    if (selected.length >= topCount + repliedCount + controversialCount) break;
    addIfNew(comment);
  }

  // 4. Contrarian comments (low score but substantive)
  const contrarian = substantiveComments
    .filter(
      (c) =>
        c.score < avgScore && // Below average
        c.score > -10 && // Not heavily downvoted spam
        c.body.length > 100 // Substantive
    )
    .sort((a, b) => b.body.length - a.body.length); // Prefer longer explanations

  for (const comment of contrarian) {
    if (selected.length >= count) break;
    addIfNew(comment);
  }

  // Fill remaining slots with next best by score
  for (const comment of byScore) {
    if (selected.length >= count) break;
    addIfNew(comment);
  }

  return selected;
}

/**
 * Gets statistics about comment diversity for logging
 */
export function getCommentDiversityStats(comments: RedditComment[]): {
  totalComments: number;
  scoreRange: { min: number; max: number };
  scoreVariance: number;
  controversialCount: number;
  avgBodyLength: number;
} {
  if (comments.length === 0) {
    return {
      totalComments: 0,
      scoreRange: { min: 0, max: 0 },
      scoreVariance: 0,
      controversialCount: 0,
      avgBodyLength: 0,
    };
  }

  const scores = comments.map((c) => c.score);
  return {
    totalComments: comments.length,
    scoreRange: {
      min: Math.min(...scores),
      max: Math.max(...scores),
    },
    scoreVariance: calculateScoreVariance(comments),
    controversialCount: comments.filter((c) =>
      hasControversialIndicators(c.body)
    ).length,
    avgBodyLength:
      comments.reduce((a, b) => a + b.body.length, 0) / comments.length,
  };
}
