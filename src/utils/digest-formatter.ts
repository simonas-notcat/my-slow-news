/**
 * Digest Formatter Utility
 *
 * Formats all digest sections to match the TEMPLATE-REFINED.md structure.
 * Provides functions for formatting:
 * - "What Matters" table with priority icons
 * - "Top Discussions" section with headers and metadata
 * - Per-post sections (The Story, Notable Threads, High-Confidence Claims)
 * - "Low-Activity Posts" as collapsible details section
 */

import { sanitizeMarkdown, slugify, formatHumanDate } from "./digest-format";

// ============================================================================
// Types
// ============================================================================

/** Priority level for posts, determining which icon to display */
export type Priority = "urgent" | "developing" | "informational";

/** Priority icons mapping */
export const PRIORITY_ICONS: Record<Priority, string> = {
  urgent: "🔴",
  developing: "🟡",
  informational: "🟢",
};

/** Thread type icons for notable threads */
export const THREAD_TYPE_ICONS: Record<string, string> = {
  debate: "⚔️",
  insight: "💡",
  story: "📖",
  warning: "✋",
  tangent: "🔀",
  technical: "🔬",
};

/** Input for What Matters table row */
export interface WhatMattersItem {
  priority: Priority;
  topic: string;
  impact: string;
  status: string;
  /** Optional link anchor for internal navigation */
  anchor?: string;
}

/** Input for a post in Top Discussions section */
export interface TopDiscussionPost {
  title: string;
  url: string;
  subreddit: string;
  score: number;
  confidence: number;
  controversyLevel?: "none" | "low" | "medium" | "high";
  /** The Story narrative (2-4 sentences) */
  storyNarrative?: string;
  /** Notable threads with their insights */
  notableThreads?: NotableThread[];
  /** High-confidence claims */
  claims?: FormattedClaim[];
}

/** Notable thread within a discussion */
export interface NotableThread {
  type: "debate" | "insight" | "story" | "warning" | "tangent" | "technical";
  insight: string;
  author?: string;
}

/** Formatted claim for display */
export interface FormattedClaim {
  text: string;
  confidence: number;
  isVerified: boolean;
}

/** Low-activity post for collapsible section */
export interface LowActivityPost {
  title: string;
  url: string;
  subreddit: string;
  score: number;
  commentCount: number;
  /** Brief description of the post */
  description?: string;
  /** Confidence warning if low */
  confidenceWarning?: string;
}

// ============================================================================
// What Matters Section
// ============================================================================

/**
 * Formats the "What Matters" table header and legend
 */
export function formatWhatMattersHeader(): string {
  let output = `## What Matters\n\n`;
  output += `| Topic | Impact | Status |\n`;
  output += `|-------|--------|--------|\n`;
  return output;
}

/**
 * Formats a single row in the What Matters table
 */
export function formatWhatMattersRow(item: WhatMattersItem): string {
  const icon = PRIORITY_ICONS[item.priority];
  const safeTopic = sanitizeMarkdown(item.topic);
  const safeImpact = sanitizeMarkdown(item.impact);
  const safeStatus = sanitizeMarkdown(item.status);

  // Format topic with bold for emphasis
  const topicDisplay = `${icon} **${safeTopic}**`;

  return `| ${topicDisplay} | ${safeImpact} | ${safeStatus} |\n`;
}

/**
 * Formats the complete What Matters table including legend
 */
export function formatWhatMattersTable(items: WhatMattersItem[]): string {
  if (items.length === 0) {
    return "";
  }

  let output = formatWhatMattersHeader();

  for (const item of items) {
    output += formatWhatMattersRow(item);
  }

  // Add legend note
  output += `\n**Note:** 🔴 Urgent • 🟡 Developing • 🟢 Informational\n\n`;
  output += `---\n\n`;

  return output;
}

// ============================================================================
// Top Discussions Section
// ============================================================================

/**
 * Formats the header for a top discussion post
 */
export function formatDiscussionHeader(post: TopDiscussionPost): string {
  const safeTitle = sanitizeMarkdown(post.title);
  const safeSubreddit = sanitizeMarkdown(post.subreddit);

  let output = `### [${safeTitle}](${post.url}) • r/${safeSubreddit}\n`;

  // Metadata line: Score, Confidence, and optional Controversy
  const confidencePct = Math.round(post.confidence * 100);
  let metaLine = `**Score: ${post.score} • Confidence: ${confidencePct}%**`;

  if (post.controversyLevel && post.controversyLevel !== "none") {
    const controversyLabel =
      post.controversyLevel === "high"
        ? "High"
        : post.controversyLevel === "medium"
          ? "Medium"
          : "Low";
    metaLine += ` • Controversy: ${controversyLabel}`;
  }

  output += `${metaLine}\n\n`;

  return output;
}

/**
 * Formats "The Story" section for a post
 */
export function formatStorySection(narrative: string): string {
  if (!narrative || narrative.trim().length === 0) {
    return "";
  }

  const safeNarrative = sanitizeMarkdown(narrative.trim());
  return `**The Story:**\n${safeNarrative}\n\n`;
}

/**
 * Formats the Notable Threads section
 */
export function formatNotableThreads(threads: NotableThread[]): string {
  if (!threads || threads.length === 0) {
    return "";
  }

  let output = `**Notable Threads:**\n`;

  for (const thread of threads) {
    const icon = THREAD_TYPE_ICONS[thread.type] || "•";
    const safeInsight = sanitizeMarkdown(thread.insight);
    output += `- ${icon} ${safeInsight}\n`;
  }

  output += `\n`;
  return output;
}

/**
 * Formats the High-Confidence Claims section
 */
export function formatHighConfidenceClaims(claims: FormattedClaim[]): string {
  if (!claims || claims.length === 0) {
    return "";
  }

  let output = `**High-Confidence Claims:**\n`;

  for (const claim of claims) {
    const verificationMark = claim.isVerified ? "✓" : "?";
    const confidencePct = Math.round(claim.confidence * 100);
    const safeText = sanitizeMarkdown(claim.text);
    output += `- ${verificationMark} ${safeText} (${confidencePct}%)\n`;
  }

  output += `\n`;
  return output;
}

/**
 * Formats a complete Top Discussion post section
 */
export function formatTopDiscussionPost(post: TopDiscussionPost): string {
  let output = formatDiscussionHeader(post);

  if (post.storyNarrative) {
    output += formatStorySection(post.storyNarrative);
  }

  if (post.notableThreads && post.notableThreads.length > 0) {
    output += formatNotableThreads(post.notableThreads);
  }

  if (post.claims && post.claims.length > 0) {
    output += formatHighConfidenceClaims(post.claims);
  }

  output += `---\n\n`;

  return output;
}

/**
 * Formats the entire Top Discussions section
 */
export function formatTopDiscussionsSection(posts: TopDiscussionPost[]): string {
  if (posts.length === 0) {
    return "";
  }

  let output = `## Top Discussions\n\n`;

  for (const post of posts) {
    output += formatTopDiscussionPost(post);
  }

  return output;
}

// ============================================================================
// Per-Post Section (Full Detail)
// ============================================================================

/** Full post data for detailed formatting */
export interface FullPostSection {
  title: string;
  url: string;
  subreddit: string;
  score: number;
  commentCount: number;
  confidence: number;
  controversyLevel?: "none" | "low" | "medium" | "high";
  informationDensity?: "sparse" | "moderate" | "rich";
  /** The Story narrative */
  storyNarrative?: string;
  /** Story hook (teaser) */
  storyHook?: string;
  /** Main summary text */
  summary: string;
  /** Notable threads */
  notableThreads?: NotableThread[];
  /** High-confidence claims */
  claims?: FormattedClaim[];
  /** Missing context warnings */
  missingContext?: string[];
}

/**
 * Formats a complete per-post section with all subsections
 */
export function formatPostSection(post: FullPostSection): string {
  const slug = slugify(post.title);
  const safeTitle = sanitizeMarkdown(post.title);

  let output = `### [${safeTitle}](${post.url}) {#${slug}}\n\n`;

  // Metadata line
  const confidencePct = Math.round(post.confidence * 100);
  let metaLine = `**${post.score}↑** • ${post.commentCount} comments • ${confidencePct}% confidence`;

  if (post.controversyLevel === "high") {
    metaLine += ` • ⚠️ **Controversial**`;
  } else if (post.controversyLevel === "medium") {
    metaLine += ` • ⚡ Debate`;
  }

  output += `${metaLine}\n\n`;

  // The Story section
  if (post.storyNarrative) {
    if (post.storyHook) {
      output += `**The Story:** *${sanitizeMarkdown(post.storyHook)}*\n\n`;
      output += `${sanitizeMarkdown(post.storyNarrative)}\n\n`;
    } else {
      output += `**The Story:** ${sanitizeMarkdown(post.storyNarrative)}\n\n`;
    }
  }

  // Main summary
  output += `${sanitizeMarkdown(post.summary)}\n\n`;

  // Missing context warnings (only for low confidence)
  if (post.confidence < 0.75 && post.missingContext && post.missingContext.length > 0) {
    const safeContext = post.missingContext
      .slice(0, 2)
      .map((c) => sanitizeMarkdown(c))
      .join(", ");
    output += `> ⚠️ **Missing context:** ${safeContext}\n\n`;
  }

  // Notable threads
  if (post.notableThreads && post.notableThreads.length > 0) {
    output += formatNotableThreads(post.notableThreads);
  }

  // High-confidence claims
  if (post.claims && post.claims.length > 0) {
    output += formatHighConfidenceClaims(post.claims);
  }

  output += `---\n\n`;

  return output;
}

// ============================================================================
// Low-Activity Posts Section
// ============================================================================

/**
 * Formats the Low-Activity Posts section as a collapsible details element
 */
export function formatLowActivityPosts(posts: LowActivityPost[]): string {
  if (posts.length === 0) {
    return "";
  }

  const postCount = posts.length;
  const summaryText =
    postCount === 1
      ? `1 post with limited discussion`
      : `${postCount} posts with limited discussion`;

  let output = `## Low-Activity Posts\n\n`;
  output += `<details>\n`;
  output += `<summary>${summaryText}</summary>\n\n`;

  for (const post of posts) {
    const safeTitle = sanitizeMarkdown(post.title);
    const safeSubreddit = sanitizeMarkdown(post.subreddit);

    // Post header line
    let headerLine = `### [${safeTitle}](${post.url}) • r/${safeSubreddit}`;
    headerLine += ` • Score: ${post.score}`;

    if (post.confidenceWarning) {
      headerLine += ` • ⚠️ ${sanitizeMarkdown(post.confidenceWarning)}`;
    }

    output += `${headerLine}\n`;

    // Description if available
    if (post.description) {
      output += `${sanitizeMarkdown(post.description)}\n`;
    }

    output += `\n`;
  }

  output += `</details>\n\n`;

  return output;
}

// ============================================================================
// Complete Digest Assembly
// ============================================================================

/** Complete digest data for assembly */
export interface DigestData {
  date: string;
  postCount: number;
  subredditCount: number;
  claimCount: number;
  whatMatters: WhatMattersItem[];
  topDiscussions: TopDiscussionPost[];
  postsBySubreddit: Map<string, FullPostSection[]>;
  lowActivityPosts: LowActivityPost[];
  /** Optional theme synthesis markdown */
  themeSynthesis?: string;
  /** Optional contradictions markdown */
  contradictions?: string;
}

/**
 * Formats the complete digest header
 */
export function formatDigestHeader(
  date: string,
  postCount: number,
  subredditCount: number,
  claimCount: number
): string {
  const humanDate = formatHumanDate(date);

  let output = `# My Slow News - ${date}\n\n`;
  output += `*${humanDate} • ${postCount} posts • ${subredditCount} subreddits • ${claimCount} claims extracted*\n\n`;

  return output;
}

/**
 * Formats posts grouped by subreddit
 */
export function formatPostsBySubreddit(postsBySubreddit: Map<string, FullPostSection[]>): string {
  let output = "";

  for (const [subreddit, posts] of postsBySubreddit) {
    const safeSubreddit = sanitizeMarkdown(subreddit);
    output += `## r/${safeSubreddit}\n\n`;

    for (const post of posts) {
      output += formatPostSection(post);
    }
  }

  return output;
}

/**
 * Assembles a complete digest from all components
 */
export function assembleDigest(data: DigestData): string {
  let output = "";

  // Header
  output += formatDigestHeader(data.date, data.postCount, data.subredditCount, data.claimCount);

  // What Matters table
  if (data.whatMatters.length > 0) {
    output += formatWhatMattersTable(data.whatMatters);
  }

  // Theme synthesis (if provided)
  if (data.themeSynthesis) {
    output += data.themeSynthesis;
  }

  // Contradictions (if provided)
  if (data.contradictions) {
    output += data.contradictions;
  }

  // Separator before detailed posts
  output += `---\n\n`;

  // Top discussions section
  if (data.topDiscussions.length > 0) {
    output += formatTopDiscussionsSection(data.topDiscussions);
  }

  // Posts by subreddit
  output += formatPostsBySubreddit(data.postsBySubreddit);

  // Low-activity posts
  if (data.lowActivityPosts.length > 0) {
    output += formatLowActivityPosts(data.lowActivityPosts);
  }

  return output;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Determines priority based on importance score and post characteristics
 */
export function determinePriority(
  importanceScore: number,
  controversyLevel?: "none" | "low" | "medium" | "high",
  sentiment?: "positive" | "negative" | "mixed" | "neutral"
): Priority {
  // High priority: score >= 70 or high controversy or negative sentiment
  if (importanceScore >= 70 || controversyLevel === "high" || sentiment === "negative") {
    return "urgent";
  }

  // Medium priority: score >= 45 or medium controversy or mixed sentiment
  if (importanceScore >= 45 || controversyLevel === "medium" || sentiment === "mixed") {
    return "developing";
  }

  return "informational";
}

/**
 * Truncates text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Extracts the first sentence from text
 */
export function extractFirstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]/);
  return match ? match[0].trim() : text.split(/[.!?]/)[0].trim();
}

/**
 * Creates an impact summary from a full summary (first sentence, truncated)
 */
export function createImpactSummary(summary: string, maxLength: number = 80): string {
  const firstSentence = extractFirstSentence(summary);
  return truncateText(firstSentence, maxLength);
}
