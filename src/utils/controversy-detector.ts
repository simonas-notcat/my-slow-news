/**
 * Controversy Detector
 *
 * Analyzes Reddit posts and comments to detect controversial discussions
 * before summarization, enabling appropriate handling.
 */

import type { RedditPost, RedditComment } from "../types";

export interface ControversySignals {
  scoreVariance: number;
  negativeRatio: number;
  replyDepth: number;
  keywordHits: string[];
  sentimentMix: boolean;
}

export interface ControversyResult {
  isControversial: boolean;
  score: number; // 0-1
  signals: ControversySignals;
  detectedCamps: string[];
}

// Keywords that often indicate disagreement or debate
const CONTROVERSY_KEYWORDS = [
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
  "on the other hand",
  "to be fair",
  "while i agree",
  "playing devil",
  "hot take",
  "controversial",
  "overrated",
  "underrated",
];

// Keywords that indicate strong positions
const CAMP_INDICATORS = [
  { pattern: /rust\s*(is|vs)/i, camp: "Rust advocates" },
  { pattern: /go(lang)?\s*(is|vs)/i, camp: "Go advocates" },
  { pattern: /typescript\s*(is|vs)/i, camp: "TypeScript supporters" },
  { pattern: /javascript\s*(is|vs)/i, camp: "JavaScript purists" },
  { pattern: /oop\s*(is|vs)/i, camp: "OOP proponents" },
  { pattern: /functional\s*(is|vs)/i, camp: "FP proponents" },
  { pattern: /microservices?\s*(is|vs|are)/i, camp: "Microservices advocates" },
  { pattern: /monolith\s*(is|vs)/i, camp: "Monolith defenders" },
  { pattern: /vim\s*(is|vs)/i, camp: "Vim users" },
  { pattern: /emacs\s*(is|vs)/i, camp: "Emacs users" },
  { pattern: /linux\s*(is|vs)/i, camp: "Linux users" },
  { pattern: /mac(os)?\s*(is|vs)/i, camp: "macOS users" },
  { pattern: /windows\s*(is|vs)/i, camp: "Windows users" },
];

/**
 * Calculates score variance among comments
 */
function calculateScoreVariance(comments: RedditComment[]): number {
  if (comments.length === 0) return 0;

  const scores = comments.map((c) => c.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const squaredDiffs = scores.map((s) => Math.pow(s - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / scores.length);
}

/**
 * Calculates ratio of negative-scored comments
 */
function calculateNegativeRatio(comments: RedditComment[]): number {
  if (comments.length === 0) return 0;
  const negativeCount = comments.filter((c) => c.score < 0).length;
  return negativeCount / comments.length;
}

/**
 * Estimates maximum reply depth
 */
function estimateReplyDepth(comments: RedditComment[]): number {
  const parentCounts = new Map<string, number>();

  // Count how many comments have each parent
  for (const comment of comments) {
    const parentId = comment.parent_id.replace(/^t[13]_/, "");
    parentCounts.set(parentId, (parentCounts.get(parentId) || 0) + 1);
  }

  // Build a rough depth estimate
  let maxDepth = 0;
  const depths = new Map<string, number>();

  for (const comment of comments) {
    const parentId = comment.parent_id.replace(/^t[13]_/, "");
    const parentDepth = depths.get(parentId) || 0;
    const currentDepth = parentDepth + 1;
    depths.set(comment.id, currentDepth);
    maxDepth = Math.max(maxDepth, currentDepth);
  }

  return maxDepth;
}

/**
 * Finds controversy keywords in text
 */
function findKeywordHits(text: string): string[] {
  const lowerText = text.toLowerCase();
  return CONTROVERSY_KEYWORDS.filter((keyword) =>
    lowerText.includes(keyword.toLowerCase())
  );
}

/**
 * Detects potential "camps" or factions in the discussion
 */
function detectCamps(
  post: RedditPost,
  comments: RedditComment[]
): string[] {
  const allText =
    post.title + " " + post.selftext + " " + comments.map((c) => c.body).join(" ");

  const camps = new Set<string>();
  for (const indicator of CAMP_INDICATORS) {
    if (indicator.pattern.test(allText)) {
      camps.add(indicator.camp);
    }
  }

  return Array.from(camps);
}

/**
 * Checks if there's a mix of positive and negative sentiments
 */
function hasSentimentMix(comments: RedditComment[]): boolean {
  let positive = 0;
  let negative = 0;

  for (const comment of comments) {
    const lowerBody = comment.body.toLowerCase();

    // Simple sentiment indicators
    if (
      lowerBody.includes("love") ||
      lowerBody.includes("great") ||
      lowerBody.includes("amazing") ||
      lowerBody.includes("excellent")
    ) {
      positive++;
    }
    if (
      lowerBody.includes("hate") ||
      lowerBody.includes("terrible") ||
      lowerBody.includes("awful") ||
      lowerBody.includes("worst")
    ) {
      negative++;
    }
  }

  // Has mix if both sentiments are present with significant count
  return positive >= 2 && negative >= 2;
}

/**
 * Detects controversy in a post and its comments
 */
export function detectControversy(
  post: RedditPost,
  comments: RedditComment[]
): ControversyResult {
  // Calculate signals
  const scoreVariance = calculateScoreVariance(comments);
  const negativeRatio = calculateNegativeRatio(comments);
  const replyDepth = estimateReplyDepth(comments);

  const allText =
    post.title + " " + post.selftext + " " + comments.map((c) => c.body).join(" ");
  const keywordHits = findKeywordHits(allText);

  const sentimentMix = hasSentimentMix(comments);
  const detectedCamps = detectCamps(post, comments);

  const signals: ControversySignals = {
    scoreVariance,
    negativeRatio,
    replyDepth,
    keywordHits,
    sentimentMix,
  };

  // Calculate controversy score (0-1)
  let score = 0;

  // High score variance indicates disagreement
  if (scoreVariance > 100) score += 0.3;
  else if (scoreVariance > 50) score += 0.15;

  // Significant negative comments
  if (negativeRatio > 0.2) score += 0.2;
  else if (negativeRatio > 0.1) score += 0.1;

  // Deep reply chains suggest debate
  if (replyDepth >= 5) score += 0.2;
  else if (replyDepth >= 3) score += 0.1;

  // Controversy keywords
  if (keywordHits.length >= 5) score += 0.2;
  else if (keywordHits.length >= 2) score += 0.1;

  // Sentiment mix
  if (sentimentMix) score += 0.15;

  // Multiple camps detected
  if (detectedCamps.length >= 2) score += 0.15;

  // Cap at 1
  score = Math.min(1, score);

  return {
    isControversial: score >= 0.4,
    score,
    signals,
    detectedCamps,
  };
}

/**
 * Formats controversy analysis for logging
 */
export function formatControversyReport(result: ControversyResult): string {
  const lines = [
    `Controversy Score: ${Math.round(result.score * 100)}%`,
    `Is Controversial: ${result.isControversial}`,
    `Signals:`,
    `  - Score Variance: ${result.signals.scoreVariance.toFixed(1)}`,
    `  - Negative Ratio: ${(result.signals.negativeRatio * 100).toFixed(1)}%`,
    `  - Reply Depth: ${result.signals.replyDepth}`,
    `  - Keyword Hits: ${result.signals.keywordHits.length}`,
    `  - Sentiment Mix: ${result.signals.sentimentMix}`,
  ];

  if (result.detectedCamps.length > 0) {
    lines.push(`Detected Camps: ${result.detectedCamps.join(", ")}`);
  }

  return lines.join("\n");
}
