/**
 * Theme Synthesizer
 *
 * Analyzes multiple post summaries to identify recurring themes,
 * conflicting viewpoints, and emerging trends across the day's content.
 */

import type { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { parseLLMJson } from "./parse-llm-json";
import { sanitizeMarkdown } from "./digest-format";

// Types for summarized posts
export interface PostSummaryInput {
  subreddit: string;
  title: string;
  summary: string;
  sentiment: string;
  key_topics: string[];
  controversy_level?: string;
}

// Theme synthesis result schemas
export const ThemeSynthesisSchema = z.object({
  recurring_themes: z
    .array(
      z.object({
        theme: z.string(),
        posts: z.array(z.string()),
        summary: z.string(),
        sentiment_spread: z
          .object({
            positive: z.number(),
            negative: z.number(),
            mixed: z.number(),
          })
          .optional(),
      })
    )
    .optional()
    .default([]),
  conflicting_viewpoints: z
    .array(
      z.object({
        topic: z.string(),
        viewpoint_a: z.object({
          position: z.string(),
          sources: z.array(z.string()),
        }),
        viewpoint_b: z.object({
          position: z.string(),
          sources: z.array(z.string()),
        }),
      })
    )
    .optional()
    .default([]),
  emerging_trends: z
    .array(
      z.object({
        trend: z.string(),
        evidence: z.array(z.string()),
        confidence: z.number(),
      })
    )
    .optional()
    .default([]),
});

export type ThemeSynthesis = z.infer<typeof ThemeSynthesisSchema>;

/**
 * Groups posts by overlapping topics
 */
export function clusterByTopics(
  summaries: PostSummaryInput[]
): Map<string, PostSummaryInput[]> {
  const clusters = new Map<string, PostSummaryInput[]>();

  for (const summary of summaries) {
    for (const topic of summary.key_topics) {
      const normalizedTopic = topic.toLowerCase().trim();
      if (!clusters.has(normalizedTopic)) {
        clusters.set(normalizedTopic, []);
      }
      clusters.get(normalizedTopic)!.push(summary);
    }
  }

  // Filter to topics with multiple posts
  const significantClusters = new Map<string, PostSummaryInput[]>();
  for (const [topic, posts] of clusters) {
    if (posts.length >= 2) {
      significantClusters.set(topic, posts);
    }
  }

  return significantClusters;
}

/**
 * Detects potentially conflicting claims across posts
 */
export function detectPotentialConflicts(
  summaries: PostSummaryInput[]
): Array<{ topic: string; posts: PostSummaryInput[] }> {
  const conflicts: Array<{ topic: string; posts: PostSummaryInput[] }> = [];

  // Group by shared topics
  const clusters = clusterByTopics(summaries);

  for (const [topic, posts] of clusters) {
    // Check for mixed sentiments on same topic
    const sentiments = new Set(posts.map((p) => p.sentiment));
    if (sentiments.has("positive") && sentiments.has("negative")) {
      conflicts.push({ topic, posts });
    }

    // Check for high controversy in any post
    const hasControversy = posts.some(
      (p) =>
        p.controversy_level === "high" || p.controversy_level === "medium"
    );
    if (hasControversy && posts.length >= 2) {
      if (!conflicts.find((c) => c.topic === topic)) {
        conflicts.push({ topic, posts });
      }
    }
  }

  return conflicts;
}

/**
 * Synthesizes themes across multiple posts using LLM
 */
export async function synthesizeThemes(
  agent: Agent,
  summaries: PostSummaryInput[]
): Promise<ThemeSynthesis> {
  if (summaries.length < 2) {
    return {
      recurring_themes: [],
      conflicting_viewpoints: [],
      emerging_trends: [],
    };
  }

  const summariesText = summaries
    .map(
      (s, i) =>
        `[${i + 1}] r/${s.subreddit}: "${s.title}"
Sentiment: ${s.sentiment}
Topics: ${s.key_topics.join(", ")}
Summary: ${s.summary.slice(0, 300)}${s.summary.length > 300 ? "..." : ""}`
    )
    .join("\n\n");

  const prompt = `Analyze these ${summaries.length} post summaries from today's tech news:

${summariesText}

Identify patterns across posts and return a JSON response with:

{
  "recurring_themes": [
    {
      "theme": "Theme name",
      "posts": ["post title 1", "post title 2"],
      "summary": "What this theme is about across posts",
      "sentiment_spread": {"positive": 0, "negative": 0, "mixed": 0}
    }
  ],
  "conflicting_viewpoints": [
    {
      "topic": "Topic with disagreement",
      "viewpoint_a": {
        "position": "First position",
        "sources": ["post title supporting this"]
      },
      "viewpoint_b": {
        "position": "Opposing position",
        "sources": ["post title supporting this"]
      }
    }
  ],
  "emerging_trends": [
    {
      "trend": "New pattern or development",
      "evidence": ["evidence from posts"],
      "confidence": 0.8
    }
  ]
}

Focus on substantive patterns. Return empty arrays if no clear patterns emerge.`;

  try {
    const result = await agent.generate(prompt);
    const text = typeof result === "string" ? result : result.text;

    const fallback: ThemeSynthesis = {
      recurring_themes: [],
      conflicting_viewpoints: [],
      emerging_trends: [],
    };

    const { data } = parseLLMJson(text, ThemeSynthesisSchema, fallback);
    // Parse through schema to ensure defaults are applied and types match
    return ThemeSynthesisSchema.parse(data);
  } catch (error) {
    console.error("Theme synthesis failed:", error);
    return {
      recurring_themes: [],
      conflicting_viewpoints: [],
      emerging_trends: [],
    };
  }
}

/**
 * Escapes pipe characters for markdown table cells
 */
function escapeTableCell(text: string): string {
  return sanitizeMarkdown(text).replace(/\|/g, "\\|");
}

/**
 * Formats theme synthesis for markdown output
 */
export function formatThemeSynthesisMarkdown(
  synthesis: ThemeSynthesis
): string {
  const sections: string[] = [];

  // Recurring themes
  if (synthesis.recurring_themes.length > 0) {
    sections.push("## Today's Themes\n");
    for (const theme of synthesis.recurring_themes) {
      sections.push(`### ${sanitizeMarkdown(theme.theme)}\n`);
      sections.push(sanitizeMarkdown(theme.summary) + "\n");
      sections.push("**Discussed in:**");
      for (const post of theme.posts) {
        sections.push(`- ${sanitizeMarkdown(post)}`);
      }
      sections.push("");
    }
  }

  // Conflicting viewpoints - table format
  if (synthesis.conflicting_viewpoints.length > 0) {
    sections.push("## Conflicting Viewpoints\n");
    sections.push("| Topic | View A | View B |");
    sections.push("|-------|--------|--------|");
    for (const conflict of synthesis.conflicting_viewpoints) {
      const topic = escapeTableCell(conflict.topic);
      const viewA = escapeTableCell(conflict.viewpoint_a.position);
      const viewB = escapeTableCell(conflict.viewpoint_b.position);
      sections.push(`| ${topic} | ${viewA} | ${viewB} |`);
    }
    sections.push("");
  }

  // Emerging patterns (bullet list format)
  if (synthesis.emerging_trends.length > 0) {
    sections.push("## Emerging Patterns\n");
    for (const trend of synthesis.emerging_trends) {
      const confidence = Math.round(trend.confidence * 100);
      sections.push(`- **${sanitizeMarkdown(trend.trend)}** (${confidence}% confidence)`);
      const safeEvidence = trend.evidence.map(e => sanitizeMarkdown(e)).join("; ");
      sections.push(`  - Evidence: ${safeEvidence}`);
    }
    sections.push("");
  }

  return sections.join("\n");
}

/**
 * Checks if theme synthesis should be performed
 */
export function shouldSynthesizeThemes(summaryCount: number): boolean {
  // Only synthesize if we have multiple posts to compare
  return summaryCount >= 3;
}
