/**
 * Post Importance Ranker
 *
 * Ranks posts by AI-determined importance considering multiple factors:
 * - Engagement metrics (score, comments)
 * - Controversy level
 * - Information density
 * - Sentiment (negative news often more urgent)
 * - Key topics relevance
 *
 * Posts are ordered by importance rank with bottom X% (configurable)
 * identified for low-activity section.
 */

import type { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { parseLLMJson } from "./parse-llm-json";

/**
 * Input type for posts to be ranked
 */
export interface PostForRanking {
  id: string;
  subreddit: string;
  title: string;
  score: number;
  num_comments: number;
  summary?: string;
  sentiment?: string;
  controversy_level?: string;
  information_density?: string;
  key_topics?: string[];
}

/**
 * Result of importance ranking for a single post
 */
export interface ImportanceRank {
  post_id: string;
  importance_score: number; // 0-100
  rank: number; // 1-based rank position
  reasoning?: string;
  is_low_activity: boolean;
}

/**
 * Complete importance ranking result
 */
export interface ImportanceRankingResult {
  rankings: ImportanceRank[];
  low_activity_threshold: number; // Score below which posts are "low activity"
}

/**
 * Schema for LLM ranking response
 */
const PostRankingSchema = z.object({
  post_id: z.string(),
  importance_score: z.number().min(0).max(100),
  reasoning: z.string().optional(),
});

const RankingResponseSchema = z.object({
  rankings: z.array(PostRankingSchema),
});

type RankingResponse = z.infer<typeof RankingResponseSchema>;

/**
 * Instructions for the importance ranking agent
 */
const IMPORTANCE_RANKING_INSTRUCTIONS = `You are a news editor ranking posts by importance for a daily tech digest.

Your job is to assign an importance score (0-100) to each post based on these factors:

SCORING FACTORS (consider all of these):

1. IMPACT SCOPE (0-30 points)
   - How many people/projects does this affect?
   - 25-30: Affects majority of developers in a field (security vuln, major release)
   - 15-24: Affects significant portion of a community
   - 5-14: Affects specific niche or tooling
   - 0-4: Affects very few people

2. URGENCY & TIMELINESS (0-25 points)
   - Is this time-sensitive? Breaking news?
   - 20-25: Requires immediate attention (security issues, outages)
   - 10-19: Developing story, recent announcement
   - 5-9: General update, not time-sensitive
   - 0-4: Evergreen content, historical

3. COMMUNITY ENGAGEMENT (0-20 points)
   - Based on score and comment count relative to subreddit norms
   - 15-20: Exceptional engagement (viral, heated discussion)
   - 10-14: Above average engagement
   - 5-9: Normal engagement
   - 0-4: Below average engagement

4. CONTROVERSY & DEBATE (0-15 points)
   - Is there significant disagreement or debate?
   - 12-15: Highly controversial, strong opposing viewpoints
   - 7-11: Notable debate, mixed opinions
   - 3-6: Some discussion, mostly consensus
   - 0-2: Little to no controversy

5. INFORMATION VALUE (0-10 points)
   - How useful/informative is the content?
   - 8-10: Rich information, educational, actionable insights
   - 5-7: Moderate information value
   - 2-4: Basic information, nothing new
   - 0-1: Low information density

SCORING GUIDELINES:
- Be discriminating: Not everything is important
- Use the FULL range (0-100): Don't cluster around 50
- Consider negative news bias: Security issues, breaking changes often warrant higher scores
- Group related topics mentally but score each post individually
- Low engagement doesn't always mean low importance (niche but critical info can be low-traffic)

OUTPUT FORMAT:
Return a JSON object with rankings array. Each item must have:
- post_id: The ID provided in input
- importance_score: 0-100 integer
- reasoning: Brief explanation of score (1 sentence)

Example:
{
  "rankings": [
    {"post_id": "abc123", "importance_score": 85, "reasoning": "Critical security vulnerability affecting major framework"},
    {"post_id": "def456", "importance_score": 42, "reasoning": "Interesting library update, limited immediate impact"}
  ]
}`;

/**
 * Creates an importance ranking agent
 */
export function createImportanceRankerAgent(model?: string): Agent {
  const { Agent } = require("@mastra/core/agent");
  const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";

  return new Agent({
    name: "importance-ranker",
    instructions: IMPORTANCE_RANKING_INSTRUCTIONS,
    model: (model || DEFAULT_MODEL) as any,
  });
}

/**
 * Calculates a heuristic importance score based on metrics
 * Used as a fallback or for weighting AI scores
 */
export function calculateHeuristicScore(post: PostForRanking): number {
  let score = 0;

  // Engagement score (0-30)
  const engagementRaw = Math.log10(Math.max(1, post.score)) * 5 +
    Math.log10(Math.max(1, post.num_comments)) * 5;
  score += Math.min(30, engagementRaw);

  // Controversy bonus (0-15)
  if (post.controversy_level === "high") {
    score += 15;
  } else if (post.controversy_level === "medium") {
    score += 8;
  } else if (post.controversy_level === "low") {
    score += 3;
  }

  // Information density bonus (0-10)
  if (post.information_density === "rich") {
    score += 10;
  } else if (post.information_density === "moderate") {
    score += 5;
  }

  // Negative sentiment often indicates urgent news (0-10)
  if (post.sentiment === "negative") {
    score += 10;
  } else if (post.sentiment === "mixed") {
    score += 5;
  }

  // Normalize to 0-100
  return Math.min(100, Math.max(0, Math.round(score * 1.5)));
}

/**
 * Ranks posts by importance using AI analysis
 *
 * @param agent - The Mastra agent to use for ranking
 * @param posts - Array of posts to rank
 * @param lowActivityPercentile - Percentile below which posts are marked "low activity" (default: 20)
 * @returns ImportanceRankingResult with ranked posts
 */
export async function rankPostsByImportance(
  agent: Agent,
  posts: PostForRanking[],
  lowActivityPercentile: number = 20
): Promise<ImportanceRankingResult> {
  if (posts.length === 0) {
    return {
      rankings: [],
      low_activity_threshold: 0,
    };
  }

  // For very few posts, use heuristic scoring
  if (posts.length <= 2) {
    const heuristicRankings = posts
      .map((post) => ({
        post_id: post.id,
        importance_score: calculateHeuristicScore(post),
        reasoning: "Heuristic scoring (small batch)",
        is_low_activity: false,
      }))
      .sort((a, b) => b.importance_score - a.importance_score)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    return {
      rankings: heuristicRankings,
      low_activity_threshold: 0,
    };
  }

  // Format posts for the prompt
  const postsText = posts
    .map(
      (p, i) =>
        `[${i + 1}] ID: ${p.id}
Subreddit: r/${p.subreddit}
Title: "${p.title}"
Score: ${p.score} upvotes, ${p.num_comments} comments
Sentiment: ${p.sentiment || "unknown"}
Controversy: ${p.controversy_level || "unknown"}
Information Density: ${p.information_density || "unknown"}
Topics: ${(p.key_topics || []).join(", ") || "none"}
Summary: ${(p.summary || "").slice(0, 300)}${(p.summary || "").length > 300 ? "..." : ""}`
    )
    .join("\n\n");

  const prompt = `Rank these ${posts.length} posts by importance for a daily tech news digest:

${postsText}

Assign each post an importance score from 0-100 and explain your reasoning briefly.
Return as JSON with a "rankings" array.`;

  try {
    const result = await agent.generate(prompt);
    const text = typeof result === "string" ? result : result.text;

    const fallback: RankingResponse = {
      rankings: posts.map((p) => ({
        post_id: p.id,
        importance_score: calculateHeuristicScore(p),
        reasoning: "Fallback to heuristic scoring",
      })),
    };

    const { data, success, error } = parseLLMJson(
      text,
      RankingResponseSchema,
      fallback
    );

    if (!success) {
      console.warn("Importance ranking JSON parse failed:", error);
    }

    // Map AI scores back to posts, filling any missing with heuristics
    const scoreMap = new Map<string, { score: number; reasoning?: string }>();
    for (const ranking of data.rankings) {
      scoreMap.set(ranking.post_id, {
        score: ranking.importance_score,
        reasoning: ranking.reasoning,
      });
    }

    // Ensure all posts have scores
    for (const post of posts) {
      if (!scoreMap.has(post.id)) {
        scoreMap.set(post.id, {
          score: calculateHeuristicScore(post),
          reasoning: "Fallback to heuristic scoring",
        });
      }
    }

    // Sort by score descending and assign ranks
    const sortedRankings = posts
      .map((post) => {
        const scoreData = scoreMap.get(post.id)!;
        return {
          post_id: post.id,
          importance_score: scoreData.score,
          reasoning: scoreData.reasoning,
          rank: 0,
          is_low_activity: false,
        };
      })
      .sort((a, b) => b.importance_score - a.importance_score)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    // Calculate low activity threshold (bottom X percentile)
    const scores = sortedRankings.map((r) => r.importance_score).sort((a, b) => a - b);
    const thresholdIndex = Math.max(0, Math.floor(scores.length * (lowActivityPercentile / 100)) - 1);
    const lowActivityThreshold = scores[thresholdIndex] ?? 0;

    // Mark posts below threshold as low activity
    for (const ranking of sortedRankings) {
      ranking.is_low_activity = ranking.importance_score <= lowActivityThreshold;
    }

    return {
      rankings: sortedRankings,
      low_activity_threshold: lowActivityThreshold,
    };
  } catch (error) {
    console.error("Importance ranking failed:", error);

    // Fallback to heuristic scoring
    const heuristicRankings = posts
      .map((post) => ({
        post_id: post.id,
        importance_score: calculateHeuristicScore(post),
        reasoning: `Heuristic fallback: ${error instanceof Error ? error.message : "Unknown error"}`,
        is_low_activity: false,
        rank: 0,
      }))
      .sort((a, b) => b.importance_score - a.importance_score)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    const scores = heuristicRankings.map((r) => r.importance_score).sort((a, b) => a - b);
    const thresholdIndex = Math.max(0, Math.floor(scores.length * (lowActivityPercentile / 100)) - 1);
    const lowActivityThreshold = scores[thresholdIndex] ?? 0;

    for (const ranking of heuristicRankings) {
      ranking.is_low_activity = ranking.importance_score <= lowActivityThreshold;
    }

    return {
      rankings: heuristicRankings,
      low_activity_threshold: lowActivityThreshold,
    };
  }
}

/**
 * Sorts posts by their importance rank
 * @param posts - Array of posts
 * @param rankings - Importance rankings from rankPostsByImportance
 * @returns Posts sorted by importance (most important first)
 */
export function sortPostsByImportance<T extends { id?: string }>(
  posts: T[],
  rankings: ImportanceRank[],
  idExtractor: (post: T) => string
): T[] {
  const rankMap = new Map<string, number>();
  for (const ranking of rankings) {
    rankMap.set(ranking.post_id, ranking.rank);
  }

  return [...posts].sort((a, b) => {
    const rankA = rankMap.get(idExtractor(a)) ?? Infinity;
    const rankB = rankMap.get(idExtractor(b)) ?? Infinity;
    return rankA - rankB;
  });
}

/**
 * Checks if importance ranking should be performed based on post count
 */
export function shouldRankByImportance(postCount: number): boolean {
  return postCount >= 2;
}
