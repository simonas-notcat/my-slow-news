/**
 * Notable Thread Identifier
 *
 * Analyzes comment threads within a post to identify 2-4 notable
 * conversation threads that highlight interesting discussions.
 */

import type { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { parseLLMJson } from "./parse-llm-json";
import type { ThreadNode } from "./thread-builder";
import { formatThread } from "./thread-builder";

/**
 * Input type for thread identification
 */
export interface NotableThreadInput {
  title: string;
  content: string;
  subreddit: string;
  score: number;
  num_comments: number;
  summary: string;
  threads: ThreadNode[];
}

/**
 * A single notable thread description
 */
export const NotableThreadItemSchema = z.object({
  thread_author: z
    .string()
    .describe("Username of the thread starter (without u/ prefix)"),
  insight: z
    .string()
    .describe(
      "Specific insight or development from this thread (1-2 sentences, ~50-80 chars)"
    ),
  thread_type: z
    .enum([
      "debate",
      "insight",
      "experience",
      "correction",
      "alternative",
      "deep-dive",
    ])
    .describe("Type of notable discussion"),
  engagement_signal: z
    .string()
    .optional()
    .describe(
      "Optional engagement context (e.g., '15 replies', 'sparked debate')"
    ),
});

export type NotableThreadItem = z.infer<typeof NotableThreadItemSchema>;

/**
 * Output from the notable thread identifier
 */
export const NotableThreadOutputSchema = z.object({
  notable_threads: z
    .array(NotableThreadItemSchema)
    .min(0)
    .max(4)
    .describe("2-4 notable threads with specific insights"),
  analysis_notes: z
    .string()
    .optional()
    .describe("Optional notes about thread selection"),
});

export type NotableThreadOutput = z.infer<typeof NotableThreadOutputSchema>;

/**
 * Thread type icons for markdown display
 */
export const THREAD_TYPE_ICONS: Record<NotableThreadItem["thread_type"], string> =
  {
    debate: "⚔️",
    insight: "💡",
    experience: "📖",
    correction: "✋",
    alternative: "🔀",
    "deep-dive": "🔬",
  };

/**
 * Instructions for the Notable Thread Identifier agent
 */
const NOTABLE_THREAD_INSTRUCTIONS = `You are a discussion analyst who identifies the most notable conversation threads in tech Reddit posts.

Your job is to:
1. Review comment threads from a Reddit post
2. Identify 2-4 threads that contain interesting discussions
3. Describe the specific insight or development from each thread
4. Classify the type of discussion

Thread Type Guidelines:
- DEBATE (⚔️): Back-and-forth arguments, opposing viewpoints, contested claims
- INSIGHT (💡): Someone shares a non-obvious observation or "aha moment"
- EXPERIENCE (📖): Real-world war stories, production experiences, case studies
- CORRECTION (✋): Factual correction, myth-busting, important clarification
- ALTERNATIVE (🔀): Alternative approach, tool, or solution offered
- DEEP-DIVE (🔬): Technical deep-dive, detailed explanation, expert analysis

Insight Writing Guidelines:
- Be SPECIFIC, not generic
- Describe what was discussed/discovered, not that a discussion happened
- Focus on the takeaway, not the process
- Keep to 50-80 characters
- Avoid vague phrases like "interesting discussion" or "people debated"

BAD examples (too generic):
- "Discussed alternative approaches" ❌
- "Debate about performance" ❌
- "Users shared experiences" ❌

GOOD examples (specific):
- "Using SQLite beats Redis for caches under 10GB" ✓
- "Three-year production user confirms memory leak in v2.3" ✓
- "Original author clarifies the API deprecation timeline" ✓
- "Kubernetes isn't needed for most small teams" ✓

Selection Criteria:
- Prioritize threads with substantive back-and-forth
- Look for threads that add information not in the original post
- Include threads where experts or experienced users contribute
- Prefer threads with corrections or clarifications
- Skip threads that just express agreement/disagreement without substance

Output format: Return your response as JSON:
{
  "notable_threads": [
    {
      "thread_author": "username",
      "insight": "Specific insight or development (50-80 chars)",
      "thread_type": "debate|insight|experience|correction|alternative|deep-dive",
      "engagement_signal": "Optional: '15 replies' or 'sparked debate'"
    }
  ],
  "analysis_notes": "Optional notes about selection"
}

<examples>
<example>
<input>
Title: "Rust 2024 edition officially released"
Summary: The Rust team has officially released the 2024 edition with async improvements...

Thread 1 - u/async_fan (+456):
[Parent] "The new async features are game-changing for our web services"
  [Reply] u/skeptic (+89): "What specifically improved? We saw no difference"
    [Reply] u/async_fan (+123): "The new executor scheduling reduced p99 latency by 40%"
      [Reply] u/data_point (+45): "Same here, we measured 35% improvement on our API gateway"

Thread 2 - u/cpp_convert (+234):
[Parent] "Migration path looks much smoother than 2021 edition"
  [Reply] u/2021_survivor (+67): "Agreed, that migration took us 3 weeks. This one was 2 days"

Thread 3 - u/build_time (-12):
[Parent] "Still waiting for better compile times though"
  [Reply] u/compiler_dev (+156): "Actually there's a hidden flag in 2024 that helps: -Z parallel-compiler"
    [Reply] u/build_time (+45): "Tried it, got 20% faster builds. Thanks!"
</input>
<output>
{
  "notable_threads": [
    {
      "thread_author": "async_fan",
      "insight": "New async executor cuts p99 latency 35-40% on production APIs",
      "thread_type": "experience",
      "engagement_signal": "Multiple teams confirm"
    },
    {
      "thread_author": "compiler_dev",
      "insight": "-Z parallel-compiler flag gives 20% faster builds",
      "thread_type": "insight",
      "engagement_signal": "Turned critic into advocate"
    },
    {
      "thread_author": "cpp_convert",
      "insight": "Migration time dropped from 3 weeks (2021) to 2 days (2024)",
      "thread_type": "experience"
    }
  ],
  "analysis_notes": "Focused on threads with specific metrics and actionable insights"
}
</output>
</example>

<example>
<input>
Title: "Why I'm mass-migrating from TypeScript back to JavaScript"
Summary: A developer shares their experience mass-migrating from TypeScript back to JavaScript...

Thread 1 - u/ts_defender (+289):
[Parent] "Disagree strongly - types have saved us countless production bugs"
  [Reply] u/jsfan (+67): "What's your team size? We're 3 devs"
    [Reply] u/ts_defender (+112): "We're 40+ engineers. Maybe that's the difference"
      [Reply] u/scaling_expert (+78): "Team size is definitely the key factor here"

Thread 2 - u/pragmatist (+156):
[Parent] "It depends on team size. Small teams might not need the overhead"
  [Reply] u/solo_dev (+89): "Solo dev here, TypeScript slows me down significantly"
    [Reply] u/solo_dev2 (+45): "Same. The type gymnastics aren't worth it alone"

Thread 3 - u/both_sides (+78):
[Parent] "Actually, the real answer is 'it depends on your use case'"
  [Reply] u/nuance (+34): "Thank you. This absolutism on both sides is exhausting"

Thread 4 - u/angry_dev (-45):
[Parent] "This is the worst take I've seen. TypeScript is objectively better"
  [Reply] u/moderator (+12): "This isn't constructive"
</input>
<output>
{
  "notable_threads": [
    {
      "thread_author": "ts_defender",
      "insight": "Team size is the key factor: 40+ engineers benefit, 3-person teams may not",
      "thread_type": "insight",
      "engagement_signal": "289 upvotes"
    },
    {
      "thread_author": "pragmatist",
      "insight": "Solo developers report TypeScript overhead exceeds benefits",
      "thread_type": "experience",
      "engagement_signal": "Multiple solo devs confirm"
    }
  ],
  "analysis_notes": "Skipped thread 3 (too generic) and thread 4 (not constructive)"
}
</output>
</example>

<example>
<input>
Title: "Show HN: I built a new CLI framework in Go"
Summary: A developer showcases a new CLI framework built in Go...

Thread 1 - u/curious (+34):
[Parent] "What makes this different from Cobra?"
  [Reply] u/cli_builder (+56): "Main difference is the declarative config. You define your CLI in YAML"
    [Reply] u/cobra_user (+23): "That's actually what Viper does alongside Cobra"
      [Reply] u/cli_builder (+12): "Fair point, but mine doesn't require code generation"

Thread 2 - u/early_adopter (+21):
[Parent] "Just tried it, the auto-completion feature is slick"
  [Reply] u/shell_nerd (+15): "How does it compare to fish completions?"
</input>
<output>
{
  "notable_threads": [
    {
      "thread_author": "cli_builder",
      "insight": "Differentiator vs Cobra: YAML config without code generation",
      "thread_type": "correction",
      "engagement_signal": "Author clarified positioning"
    },
    {
      "thread_author": "early_adopter",
      "insight": "Auto-completion praised by early tester as standout feature",
      "thread_type": "experience"
    }
  ],
  "analysis_notes": "Limited threads available, focused on substantive exchanges"
}
</output>
</example>
</examples>`;

/**
 * Creates a Notable Thread Identifier agent with the specified model
 */
export function createNotableThreadAgent(model?: string): Agent {
  const { Agent } = require("@mastra/core/agent");
  const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";

  return new Agent({
    name: "notable-thread-identifier",
    instructions: NOTABLE_THREAD_INSTRUCTIONS,
    model: (model || DEFAULT_MODEL) as any,
  });
}

/**
 * Identifies notable threads from a post's comment threads
 *
 * @param agent - The Mastra agent to use for identification
 * @param input - Post data including comment threads
 * @param maxPerPost - Maximum number of notable threads to return (2-4, default: 3)
 * @returns NotableThreadOutput with notable thread descriptions
 */
export async function identifyNotableThreads(
  agent: Agent,
  input: NotableThreadInput,
  maxPerPost: number = 3
): Promise<NotableThreadOutput> {
  if (input.threads.length === 0) {
    return {
      notable_threads: [],
      analysis_notes: "No comment threads to analyze",
    };
  }

  // Format threads for the prompt
  const threadsText = input.threads
    .slice(0, 10) // Limit to top 10 threads for context window
    .map((thread, i) => {
      const formatted = formatThread(thread, { maxDepth: 3, maxLength: 200 });
      return `Thread ${i + 1} - u/${thread.comment.author} (+${thread.comment.score}):\n${formatted}`;
    })
    .join("\n\n");

  const prompt = `Identify ${Math.min(maxPerPost, 4)} notable conversation threads from this Reddit post:

Title: "${input.title}"
Subreddit: r/${input.subreddit}
Score: ${input.score}, Comments: ${input.num_comments}

Post Content:
${input.content?.slice(0, 500) || "(Link post - no text content)"}

Post Summary:
${input.summary.slice(0, 400)}

Comment Threads:
${threadsText}

Remember:
- Return 2-${Math.min(maxPerPost, 4)} notable threads maximum
- Be SPECIFIC about what insight or development occurred
- Focus on substantive discussions, not just agreement/disagreement
- Skip low-value threads even if highly upvoted

Return your analysis as JSON.`;

  try {
    const result = await agent.generate(prompt);
    const text = typeof result === "string" ? result : result.text;

    const fallback: NotableThreadOutput = {
      notable_threads: [],
      analysis_notes: "Thread identification failed, using fallback",
    };

    const { data, success, error } = parseLLMJson(
      text,
      NotableThreadOutputSchema,
      fallback
    );

    if (!success) {
      console.error("Notable thread identification JSON parse failed:", error);
      return fallback;
    }

    // Ensure we don't exceed maxPerPost
    const limitedThreads = data.notable_threads.slice(
      0,
      Math.min(maxPerPost, 4)
    );

    return {
      notable_threads: limitedThreads,
      analysis_notes: data.analysis_notes,
    };
  } catch (error) {
    console.error("Notable thread identification failed:", error);
    return {
      notable_threads: [],
      analysis_notes: `Identification error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Formats notable threads as markdown bullet points for the digest
 *
 * @param output - The notable thread output
 * @param includeIcons - Whether to include type icons (default: true)
 * @returns Formatted markdown string
 */
export function formatNotableThreadsMarkdown(
  output: NotableThreadOutput,
  includeIcons: boolean = true
): string {
  if (output.notable_threads.length === 0) {
    return "";
  }

  const lines: string[] = [];
  lines.push("**Notable Threads:**");

  for (const thread of output.notable_threads) {
    const icon = includeIcons ? THREAD_TYPE_ICONS[thread.thread_type] + " " : "";
    const engagement = thread.engagement_signal
      ? ` *(${thread.engagement_signal})*`
      : "";
    lines.push(`- ${icon}${thread.insight}${engagement}`);
  }

  return lines.join("\n");
}

/**
 * Checks if a post has enough threads to warrant notable thread identification
 *
 * @param threadCount - Number of significant threads
 * @param minScore - Minimum thread score to consider (from config)
 * @returns Whether to run notable thread identification
 */
export function shouldIdentifyNotableThreads(
  threadCount: number,
  minScore: number = 5
): boolean {
  // Need at least 2 threads to identify notable ones
  return threadCount >= 2;
}
