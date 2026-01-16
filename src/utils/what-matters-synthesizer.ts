/**
 * What Matters Synthesizer
 *
 * Analyzes all summarized posts and generates a priority-based "What Matters"
 * summary table identifying the most significant topics of the day.
 */

import type { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { parseLLMJson } from "./parse-llm-json";
import { sanitizeMarkdown } from "./digest-format";

/**
 * Input type for post summaries to analyze
 */
export interface WhatMattersInput {
  subreddit: string;
  title: string;
  summary: string;
  sentiment: string;
  key_topics: string[];
  controversy_level?: string;
  score: number;
  num_comments: number;
}

/**
 * Priority levels for "What Matters" items
 * - urgent: Breaking news, security issues, major releases requiring immediate attention
 * - developing: Ongoing stories, debates, trends that are evolving
 * - informational: General updates, announcements, educational content
 */
export type WhatMattersPriority = "urgent" | "developing" | "informational";

/**
 * Priority icon mapping for markdown display
 */
export const PRIORITY_ICONS: Record<WhatMattersPriority, string> = {
  urgent: "🔴",
  developing: "🟡",
  informational: "🟢",
};

/**
 * Single item in the "What Matters" summary
 */
export const WhatMattersItemSchema = z.object({
  priority: z.enum(["urgent", "developing", "informational"]),
  topic: z.string().describe("Short topic name (3-5 words)"),
  impact: z.string().describe("Brief impact description (~50 chars)"),
  status: z
    .object({
      community: z
        .string()
        .describe("Community response summary (e.g., 'Mixed reactions', 'Largely positive')"),
      official: z
        .string()
        .optional()
        .describe("Official response if any (e.g., 'No response yet', 'Acknowledged')"),
    })
    .describe("Response status from community and official sources"),
  source_posts: z
    .array(z.string())
    .optional()
    .default([])
    .describe("Titles of source posts for this topic"),
});

export type WhatMattersItem = z.infer<typeof WhatMattersItemSchema>;

/**
 * Complete "What Matters" synthesis result
 */
export const WhatMattersSynthesisSchema = z.object({
  items: z
    .array(WhatMattersItemSchema)
    .min(0)
    .max(6)
    .describe("3-6 most significant topics"),
  synthesis_notes: z
    .string()
    .optional()
    .describe("Optional notes about the synthesis process"),
});

export type WhatMattersSynthesis = z.infer<typeof WhatMattersSynthesisSchema>;

/**
 * Instructions for the What Matters Synthesizer agent
 */
const WHAT_MATTERS_INSTRUCTIONS = `You are a news editor synthesizing the most important topics from today's tech news.

Your job is to:
1. Review all summarized posts from the day
2. Identify the 3-6 most significant topics that readers should know about
3. Assess the priority level of each topic
4. Summarize the impact in ~50 characters
5. Capture both community and official response status

Priority Guidelines:
- URGENT (🔴): Security vulnerabilities, breaking changes affecting many users, major outages, critical bugs, time-sensitive announcements
- DEVELOPING (🟡): Ongoing debates, evolving stories, recent releases being discussed, controversial changes, emerging trends
- INFORMATIONAL (🟢): General updates, new features, educational content, announcements without immediate impact

Impact Writing:
- Keep to ~50 characters (hard limit: 60)
- Focus on WHO is affected and HOW
- Be specific, not vague (e.g., "Rust users face breaking API changes" not "Some changes coming")

Status Assessment:
- Community: Summarize overall sentiment (e.g., "Largely supportive", "Heated debate", "Mixed reactions", "Cautiously optimistic")
- Official: Note if maintainers/companies have responded (e.g., "No response yet", "Fix in progress", "Acknowledged issue", "Workaround provided")

Selection Criteria:
- Prioritize topics affecting many developers
- Consider engagement (score + comments) as a signal of importance
- Group related posts under a single topic
- Include controversial topics even if engagement is lower
- Don't include low-impact announcements just to fill slots

Output format: Return your response as JSON:
{
  "items": [
    {
      "priority": "urgent|developing|informational",
      "topic": "Short Topic Name",
      "impact": "Who is affected and how (~50 chars)",
      "status": {
        "community": "Community response summary",
        "official": "Official response if any"
      },
      "source_posts": ["Post title 1", "Post title 2"]
    }
  ],
  "synthesis_notes": "Optional notes about the synthesis"
}

<examples>
<example>
<input>
Posts from r/programming, r/rust, r/typescript today:

[1] r/rust: "Critical memory safety bug found in popular crate"
Sentiment: negative, Controversy: high
Summary: Security researchers discovered a use-after-free vulnerability in a widely-used serialization crate affecting ~40% of Rust projects...

[2] r/rust: "Rust 2024 edition migration guide published"
Sentiment: positive, Controversy: low
Summary: The Rust team has published comprehensive migration documentation for the upcoming 2024 edition...

[3] r/typescript: "TypeScript 5.5 brings isolated declarations"
Sentiment: positive, Controversy: low
Summary: The new TypeScript release adds isolated declarations for faster builds...

[4] r/programming: "GitHub Copilot alternatives comparison 2024"
Sentiment: mixed, Controversy: medium
Summary: Comprehensive comparison of AI coding assistants shows varying results...

[5] r/typescript: "Why we're mass-migrating back to JavaScript"
Sentiment: mixed, Controversy: high
Summary: A team shares their experience leaving TypeScript after 3 years...
</input>
<output>
{
  "items": [
    {
      "priority": "urgent",
      "topic": "Rust Crate Security Flaw",
      "impact": "40% of Rust projects potentially affected by memory bug",
      "status": {
        "community": "Scrambling to audit dependencies",
        "official": "Patch in progress, ETA 24hrs"
      },
      "source_posts": ["Critical memory safety bug found in popular crate"]
    },
    {
      "priority": "developing",
      "topic": "TypeScript vs JavaScript Debate",
      "impact": "Teams reconsidering TypeScript adoption tradeoffs",
      "status": {
        "community": "Heated debate on type safety value",
        "official": "No response yet"
      },
      "source_posts": ["Why we're mass-migrating back to JavaScript"]
    },
    {
      "priority": "developing",
      "topic": "AI Coding Assistant Landscape",
      "impact": "Developers evaluating Copilot alternatives",
      "status": {
        "community": "Mixed experiences reported",
        "official": "No response yet"
      },
      "source_posts": ["GitHub Copilot alternatives comparison 2024"]
    },
    {
      "priority": "informational",
      "topic": "Rust 2024 Edition",
      "impact": "Migration docs ready for upcoming edition",
      "status": {
        "community": "Largely positive reception",
        "official": "Full documentation published"
      },
      "source_posts": ["Rust 2024 edition migration guide published"]
    },
    {
      "priority": "informational",
      "topic": "TypeScript 5.5 Release",
      "impact": "Faster builds with isolated declarations",
      "status": {
        "community": "Positive, awaiting adoption",
        "official": "Released"
      },
      "source_posts": ["TypeScript 5.5 brings isolated declarations"]
    }
  ],
  "synthesis_notes": "Security issue prioritized due to wide impact. TS/JS debate and AI tools grouped as developing stories."
}
</output>
</example>
</examples>`;

/**
 * Creates a What Matters Synthesizer agent with the specified model
 */
export function createWhatMattersAgent(model?: string): Agent {
  const { Agent } = require("@mastra/core/agent");
  const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";

  return new Agent({
    name: "what-matters-synthesizer",
    instructions: WHAT_MATTERS_INSTRUCTIONS,
    model: (model || DEFAULT_MODEL) as any,
  });
}

/**
 * Synthesizes "What Matters" from summarized posts using LLM
 *
 * @param agent - The Mastra agent to use for synthesis
 * @param posts - Array of summarized posts to analyze
 * @param maxTopics - Maximum number of topics to return (3-6, default: 6)
 * @returns WhatMattersSynthesis with prioritized items
 */
export async function synthesizeWhatMatters(
  agent: Agent,
  posts: WhatMattersInput[],
  maxTopics: number = 6
): Promise<WhatMattersSynthesis> {
  if (posts.length === 0) {
    return {
      items: [],
      synthesis_notes: "No posts to analyze",
    };
  }

  // Format posts for the prompt
  const postsText = posts
    .map(
      (p, i) =>
        `[${i + 1}] r/${p.subreddit}: "${p.title}"
Score: ${p.score}, Comments: ${p.num_comments}
Sentiment: ${p.sentiment}, Controversy: ${p.controversy_level || "unknown"}
Topics: ${p.key_topics.join(", ")}
Summary: ${p.summary.slice(0, 400)}${p.summary.length > 400 ? "..." : ""}`
    )
    .join("\n\n");

  const prompt = `Analyze these ${posts.length} posts from today's tech news and identify the ${Math.min(maxTopics, 6)} most significant topics:

${postsText}

Remember:
- Return 3-${Math.min(maxTopics, 6)} items maximum
- Prioritize topics affecting many developers
- Use engagement metrics as importance signals
- Group related posts under single topics
- Keep impact descriptions to ~50 characters

Return your analysis as JSON.`;

  try {
    const result = await agent.generate(prompt);
    const text = typeof result === "string" ? result : result.text;

    const fallback: WhatMattersSynthesis = {
      items: [],
      synthesis_notes: "Synthesis failed, using fallback",
    };

    const { data, success, error } = parseLLMJson(
      text,
      WhatMattersSynthesisSchema,
      fallback
    );

    if (!success) {
      console.error("What Matters synthesis JSON parse failed:", error);
      return fallback;
    }

    // Parse through schema to ensure defaults are applied and types match
    const parsed = WhatMattersSynthesisSchema.parse(data);

    // Ensure we don't exceed maxTopics
    const limitedItems = parsed.items.slice(0, Math.min(maxTopics, 6));

    return {
      items: limitedItems,
      synthesis_notes: parsed.synthesis_notes,
    };
  } catch (error) {
    console.error("What Matters synthesis failed:", error);
    return {
      items: [],
      synthesis_notes: `Synthesis error: ${error instanceof Error ? error.message : "Unknown error"}`,
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
 * Truncates text to approximately the specified length, ending at a word boundary
 */
function truncateToLength(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");

  if (lastSpace > maxLength * 0.7) {
    return truncated.slice(0, lastSpace) + "...";
  }

  return truncated + "...";
}

/**
 * Formats "What Matters" synthesis as a markdown table
 *
 * Output format:
 * | Priority | Topic | Impact | Status |
 * |----------|-------|--------|--------|
 * | 🔴 | Topic Name | Impact description | Community: X / Official: Y |
 */
export function formatWhatMattersMarkdown(
  synthesis: WhatMattersSynthesis
): string {
  if (synthesis.items.length === 0) {
    return "";
  }

  const lines: string[] = [];

  lines.push("## What Matters Today\n");
  lines.push("| Priority | Topic | Impact | Status |");
  lines.push("|:--------:|-------|--------|--------|");

  for (const item of synthesis.items) {
    const icon = PRIORITY_ICONS[item.priority];
    const topic = escapeTableCell(item.topic);
    const impact = escapeTableCell(truncateToLength(item.impact, 55));

    // Format status as "Community: X / Official: Y" or just "Community: X" if no official
    let status = `Community: ${escapeTableCell(item.status.community)}`;
    if (item.status.official) {
      status += ` / Official: ${escapeTableCell(item.status.official)}`;
    }

    lines.push(`| ${icon} | ${topic} | ${impact} | ${status} |`);
  }

  lines.push("");
  lines.push("**Priority**: 🔴 Urgent · 🟡 Developing · 🟢 Informational");
  lines.push("");

  return lines.join("\n");
}

/**
 * Checks if "What Matters" synthesis should be performed
 * Requires at least 2 posts to synthesize meaningful topics
 */
export function shouldSynthesizeWhatMatters(postCount: number): boolean {
  return postCount >= 2;
}
