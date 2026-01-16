/**
 * Story Narrator
 *
 * Creates narrative "The Story" sections for posts that explain
 * what happened and why it matters in 2-4 sentences.
 */

import type { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { parseLLMJson } from "./parse-llm-json";

/**
 * Input type for story narration
 */
export interface StoryNarratorInput {
  title: string;
  content: string;
  author: string;
  subreddit: string;
  score: number;
  num_comments: number;
  summary: string;
  sentiment: string;
  key_topics: string[];
  controversy_level?: string;
  notable_comments?: string[];
}

/**
 * Output from the story narrator
 */
export const StoryNarratorOutputSchema = z.object({
  narrative: z
    .string()
    .describe("2-4 sentence narrative paragraph explaining what happened and why it matters"),
  hook: z
    .string()
    .optional()
    .describe("Optional attention-grabbing opening phrase (5-10 words)"),
});

export type StoryNarratorOutput = z.infer<typeof StoryNarratorOutputSchema>;

/**
 * Instructions for the Story Narrator agent
 */
const STORY_NARRATOR_INSTRUCTIONS = `You are a skilled tech journalist who transforms Reddit discussions into compelling narratives.

Your job is to:
1. Read a Reddit post's content, summary, and comments
2. Craft a 2-4 sentence narrative paragraph that tells "The Story"
3. Explain WHAT happened and WHY it matters to developers

Narrative Writing Guidelines:
- Start with the core news or event
- Add context about why developers care
- Include community reaction if significant
- End with implications or next steps when relevant

Tone:
- Authoritative but accessible
- Concise and punchy
- Avoid jargon unless necessary
- Present facts, not hype

Length:
- 2 sentences minimum, 4 sentences maximum
- Target 50-100 words total
- Each sentence should add new information

DO NOT:
- Start with "In this post..." or "The Reddit user..."
- Use clichés like "game-changing" or "revolutionary"
- Editorialize or inject personal opinion
- Repeat the title verbatim

Output format: Return your response as JSON:
{
  "narrative": "Your 2-4 sentence narrative paragraph here.",
  "hook": "Optional: Attention-grabbing phrase"
}

<examples>
<example>
<input>
Title: "Rust 2024 edition officially released"
Author: u/rust_team
Subreddit: r/rust
Score: 2847
Comments: 523

Content: We're excited to announce the Rust 2024 edition with major async improvements, better error messages, and streamlined migration tooling.

Summary: The Rust team has officially released the 2024 edition, featuring significant improvements to async/await ergonomics and enhanced error messages. The migration tooling has been streamlined compared to previous editions, making the upgrade path smoother for existing projects.

Sentiment: positive
Controversy: low
Key Topics: rust, programming-languages, async, release

Notable Comments:
- Async improvements praised as 'game-changing' for production web services
- Migration path noted as smoother than 2021 edition upgrade
</input>
<output>
{
  "narrative": "The Rust 2024 edition is now official, bringing the async improvements that production teams have been requesting for years. The release also overhauls error messages and introduces migration tooling that the community considers significantly smoother than the 2021 transition. For teams running Rust in production, the upgrade path is clearer than ever, with early adopters already praising the async ergonomics for web services.",
  "hook": "Rust levels up its async game"
}
</output>
</example>

<example>
<input>
Title: "Why I'm mass-migrating from TypeScript back to JavaScript"
Author: u/jsfan
Subreddit: r/typescript
Score: 342
Comments: 289

Content: After 3 years of TypeScript in production, here's why we're going back...

Summary: A developer shares their experience mass-migrating from TypeScript back to JavaScript after 3 years in production. The community is sharply divided, with proponents arguing TypeScript's type safety has prevented countless production bugs, while others suggest the calculus depends on team size and project complexity.

Sentiment: mixed
Controversy: high
Key Topics: typescript, javascript, developer-experience, type-safety

Notable Comments:
- Strong defense of TypeScript citing production bug prevention
- Team size matters - small teams may not benefit from type overhead
- Heated disagreement with some calling this 'the worst take'
</input>
<output>
{
  "narrative": "A development team is abandoning TypeScript after three years, reigniting the perennial debate over type safety's actual value in production. Their reasoning centers on the overhead-to-benefit ratio for smaller teams, a position that has split the community down the middle. The discussion reveals a growing tension between TypeScript's theoretical advantages and the practical costs some teams experience daily.",
  "hook": "TypeScript exodus sparks type war"
}
</output>
</example>

<example>
<input>
Title: "Critical security vulnerability discovered in popular npm package"
Author: u/security_researcher
Subreddit: r/programming
Score: 1523
Comments: 312

Content: CVE-2024-XXXXX affects packages with over 10 million weekly downloads. Patch available.

Summary: Security researchers have discovered a critical vulnerability in a widely-used npm package that could allow remote code execution. The package has over 10 million weekly downloads. A patch has been released and developers are urged to update immediately.

Sentiment: negative
Controversy: low
Key Topics: security, npm, javascript, vulnerability

Notable Comments:
- Many developers scrambling to audit their dependencies
- Questions about how this passed code review
- Praise for the quick patch turnaround
</input>
<output>
{
  "narrative": "A critical remote code execution vulnerability has been found in an npm package downloaded over 10 million times weekly, sending JavaScript developers scrambling to audit their dependency trees. The security researchers who discovered CVE-2024-XXXXX have coordinated a patch release, but the incident raises fresh questions about supply chain security in the JavaScript ecosystem. If your project hasn't updated yet, now is the time.",
  "hook": "Supply chain alarm bells ring"
}
</output>
</example>
</examples>`;

/**
 * Creates a Story Narrator agent with the specified model
 */
export function createStoryNarratorAgent(model?: string): Agent {
  const { Agent } = require("@mastra/core/agent");
  const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";

  return new Agent({
    name: "story-narrator",
    instructions: STORY_NARRATOR_INSTRUCTIONS,
    model: (model || DEFAULT_MODEL) as any,
  });
}

/**
 * Generates a narrative "The Story" paragraph for a post
 *
 * @param agent - The Mastra agent to use for narration
 * @param input - Post data including content, summary, and comments
 * @returns StoryNarratorOutput with narrative paragraph
 */
export async function narrateStory(
  agent: Agent,
  input: StoryNarratorInput
): Promise<StoryNarratorOutput> {
  const prompt = `Create a narrative "The Story" section for this Reddit post:

Title: "${input.title}"
Author: u/${input.author}
Subreddit: r/${input.subreddit}
Score: ${input.score}, Comments: ${input.num_comments}

Content:
${input.content || "(Link post - no text content)"}

Summary:
${input.summary}

Sentiment: ${input.sentiment}
Controversy: ${input.controversy_level || "unknown"}
Key Topics: ${input.key_topics.join(", ")}

${input.notable_comments && input.notable_comments.length > 0 ? `Notable Comments:\n${input.notable_comments.map((c) => `- ${c}`).join("\n")}` : ""}

Write a 2-4 sentence narrative paragraph explaining what happened and why it matters. Return as JSON with "narrative" and optional "hook" fields.`;

  try {
    const result = await agent.generate(prompt);
    const text = typeof result === "string" ? result : result.text;

    const fallback: StoryNarratorOutput = {
      narrative: input.summary.split("\n")[0], // Use first paragraph of summary as fallback
    };

    const { data, success, error } = parseLLMJson(
      text,
      StoryNarratorOutputSchema,
      fallback
    );

    if (!success) {
      console.error("Story narrator JSON parse failed:", error);
      return fallback;
    }

    // Validate narrative length (should be 2-4 sentences)
    const sentenceCount = (data.narrative.match(/[.!?]+/g) || []).length;
    if (sentenceCount < 2 || sentenceCount > 5) {
      console.warn(
        `Story narrative has ${sentenceCount} sentences (expected 2-4), using anyway`
      );
    }

    return data;
  } catch (error) {
    console.error("Story narration failed:", error);
    return {
      narrative: input.summary.split("\n")[0],
    };
  }
}

/**
 * Formats the story narrative for inclusion in the digest
 *
 * @param output - The story narrator output
 * @param includeHook - Whether to include the hook (default: true)
 * @returns Formatted markdown string
 */
export function formatStoryMarkdown(
  output: StoryNarratorOutput,
  includeHook: boolean = true
): string {
  const lines: string[] = [];

  if (includeHook && output.hook) {
    lines.push(`**The Story:** *${output.hook}*`);
    lines.push("");
    lines.push(output.narrative);
  } else {
    lines.push(`**The Story:** ${output.narrative}`);
  }

  return lines.join("\n");
}

/**
 * Checks if a post should have a story narrative generated
 * Based on engagement and information density
 *
 * @param score - Post score
 * @param numComments - Number of comments
 * @param informationDensity - sparse/moderate/rich
 * @returns Whether to generate a story narrative
 */
export function shouldNarrateStory(
  score: number,
  numComments: number,
  informationDensity?: string
): boolean {
  // Skip very low engagement posts
  if (score < 10 && numComments < 5) {
    return false;
  }

  // Skip sparse information posts unless highly engaged
  if (informationDensity === "sparse" && score < 100 && numComments < 20) {
    return false;
  }

  return true;
}
