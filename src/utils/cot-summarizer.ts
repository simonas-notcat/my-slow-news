/**
 * Chain-of-Thought Summarizer
 *
 * Uses structured reasoning for controversial or complex discussions
 * to ensure balanced, thorough analysis.
 */

import type { Agent } from "@mastra/core/agent";
import type { RedditPost, RedditComment } from "../types";
import { z } from "zod";
import { parseLLMJson } from "./parse-llm-json";
import { detectControversy, type ControversyResult } from "./controversy-detector";
import { selectDiverseComments } from "./comment-selector";

// Schema for controversy analysis
export const ControversyAnalysisSchema = z.object({
  main_claim: z.string(),
  supporting_points: z.array(z.string()).optional().default([]),
  opposing_points: z.array(z.string()).optional().default([]),
  community_split: z
    .array(
      z.object({
        camp_name: z.string(),
        percentage: z.number(),
        key_argument: z.string(),
      })
    )
    .optional()
    .default([]),
  nuances: z.array(z.string()).optional().default([]),
  balanced_summary: z.string(),
});

export type ControversyAnalysis = z.infer<typeof ControversyAnalysisSchema>;

// Enhanced summary response for controversial posts
export const ControversySummarySchema = z.object({
  summary: z.string(),
  notable_comments: z.array(z.string()).optional().default([]),
  sentiment: z
    .enum(["positive", "negative", "mixed", "neutral"])
    .optional()
    .default("mixed"),
  key_topics: z.array(z.string()).optional().default([]),
  confidence: z.number().min(0).max(1).optional().default(0.7),
  controversy_level: z
    .enum(["none", "low", "medium", "high"])
    .optional()
    .default("high"),
  information_density: z
    .enum(["sparse", "moderate", "rich"])
    .optional()
    .default("moderate"),
  missing_context: z.array(z.string()).optional().default([]),
  controversy_analysis: ControversyAnalysisSchema.optional(),
});

export type ControversySummary = z.infer<typeof ControversySummarySchema>;

/**
 * Generates chain-of-thought prompt for controversial discussions
 */
function generateCOTPrompt(
  post: RedditPost,
  comments: RedditComment[],
  controversyResult: ControversyResult
): string {
  const selectedComments = selectDiverseComments(comments, 15);

  const formattedComments = selectedComments
    .map((c) => `- u/${c.author} (${c.score} pts): ${c.body.slice(0, 400)}`)
    .join("\n");

  const campsInfo =
    controversyResult.detectedCamps.length > 0
      ? `\nDetected viewpoint camps: ${controversyResult.detectedCamps.join(", ")}`
      : "";

  return `Analyze this controversial discussion step by step:

Title: ${post.title}
Author: u/${post.author}
Score: ${post.score}
${campsInfo}

Content:
${post.selftext || "(Link post)"}

Comments (${comments.length} total, showing diverse selection):
${formattedComments}

Think through this systematically:

## Step 1: MAIN CLAIM
What is the central assertion or topic being debated?

## Step 2: SUPPORTING ARGUMENTS
What evidence, examples, or reasoning support the main claim?
List the key points made by proponents.

## Step 3: OPPOSING ARGUMENTS
What counterarguments are presented?
List the key points made by critics.

## Step 4: COMMUNITY DIVISION
How is the community split on this issue?
Identify distinct "camps" and estimate their relative sizes.

## Step 5: NUANCES
What nuances, edge cases, or "it depends" factors are mentioned?

## Step 6: SYNTHESIS
Write a balanced summary (2-3 paragraphs) that fairly represents all major viewpoints.

After your analysis, provide a JSON response:
{
  "summary": "Your balanced 2-3 paragraph summary",
  "notable_comments": ["Key comment insights with attribution"],
  "sentiment": "mixed",
  "key_topics": ["topic1", "topic2"],
  "confidence": 0.8,
  "controversy_level": "high",
  "information_density": "rich",
  "missing_context": [],
  "controversy_analysis": {
    "main_claim": "The central assertion",
    "supporting_points": ["Point 1", "Point 2"],
    "opposing_points": ["Counter 1", "Counter 2"],
    "community_split": [
      {"camp_name": "Supporters", "percentage": 60, "key_argument": "Their main point"},
      {"camp_name": "Critics", "percentage": 40, "key_argument": "Their main point"}
    ],
    "nuances": ["Edge case 1", "It depends factor"]
  }
}`;
}

/**
 * Performs chain-of-thought summarization for controversial posts
 */
export async function cotSummarize(
  agent: Agent,
  post: RedditPost,
  comments: RedditComment[],
  controversyResult?: ControversyResult
): Promise<ControversySummary> {
  // Detect controversy if not provided
  const controversy = controversyResult || detectControversy(post, comments);

  const prompt = generateCOTPrompt(post, comments, controversy);

  try {
    const result = await agent.generate(prompt);
    const text = typeof result === "string" ? result : result.text;

    const fallback: ControversySummary = {
      summary: text.slice(0, 1000),
      notable_comments: [],
      sentiment: "mixed",
      key_topics: [],
      confidence: 0.5,
      controversy_level: "high",
      information_density: "moderate",
      missing_context: ["COT analysis parsing failed"],
    };

    const { data, success } = parseLLMJson(
      text,
      ControversySummarySchema,
      fallback
    );

    if (!success) {
      console.warn("COT summary parsing partially failed, using fallback");
    }

    // Parse through schema to ensure defaults are applied and types match
    return ControversySummarySchema.parse(data);
  } catch (error) {
    console.error("COT summarization failed:", error);
    return {
      summary: `Controversial discussion about: ${post.title}`,
      notable_comments: [],
      sentiment: "mixed",
      key_topics: [],
      confidence: 0,
      controversy_level: "high",
      information_density: "sparse",
      missing_context: ["Summarization failed"],
    };
  }
}

/**
 * Determines if COT summarization should be used
 */
export function shouldUseCOT(
  post: RedditPost,
  comments: RedditComment[],
  threshold = 0.5
): { useCOT: boolean; controversy: ControversyResult } {
  const controversy = detectControversy(post, comments);
  return {
    useCOT: controversy.score >= threshold,
    controversy,
  };
}

/**
 * Formats controversy analysis for markdown output
 */
export function formatControversyAnalysisMarkdown(
  analysis: ControversyAnalysis
): string {
  const sections: string[] = [];

  sections.push(`**Main Claim:** ${analysis.main_claim}\n`);

  if (analysis.supporting_points.length > 0) {
    sections.push("**Supporting Arguments:**");
    for (const point of analysis.supporting_points) {
      sections.push(`- ${point}`);
    }
    sections.push("");
  }

  if (analysis.opposing_points.length > 0) {
    sections.push("**Opposing Arguments:**");
    for (const point of analysis.opposing_points) {
      sections.push(`- ${point}`);
    }
    sections.push("");
  }

  if (analysis.community_split.length > 0) {
    sections.push("**Community Split:**");
    for (const camp of analysis.community_split) {
      sections.push(
        `- **${camp.camp_name}** (~${camp.percentage}%): ${camp.key_argument}`
      );
    }
    sections.push("");
  }

  if (analysis.nuances.length > 0) {
    sections.push("**Nuances:**");
    for (const nuance of analysis.nuances) {
      sections.push(`- ${nuance}`);
    }
  }

  return sections.join("\n");
}
