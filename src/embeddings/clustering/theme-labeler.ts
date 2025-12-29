/**
 * LLM-based theme labeling for claim clusters.
 * Generates descriptive names, descriptions, and keywords for themes.
 */

import { Agent } from "@mastra/core/agent";
import { parseLLMJson } from "../../utils/parse-llm-json";
import { z } from "zod";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";

/** Maximum claims to include in labeling prompt */
const MAX_CLAIMS_FOR_LABELING = 20;

/** Maximum length for a single claim in the prompt */
const MAX_CLAIM_LENGTH = 200;

export interface ThemeLabel {
  name: string;
  description: string;
  keywords: string[];
}

const ThemeLabelSchema = z.object({
  name: z.string(),
  description: z.string(),
  keywords: z.array(z.string()),
});

// Cached agent instances by model
const agentCache = new Map<string, Agent>();

/**
 * Creates or returns a cached labeler agent for the specified model.
 */
function getLabelerAgent(model: string): Agent {
  const cachedAgent = agentCache.get(model);
  if (cachedAgent) {
    return cachedAgent;
  }

  const agent = new Agent({
    name: "theme-labeler",
    instructions:
      "You are a topic analysis assistant that generates concise labels for groups of related claims. " +
      "Analyze the claims to identify the overarching theme. " +
      "Respond only with valid JSON.",
    model: model as never,
  });

  agentCache.set(model, agent);
  return agent;
}

/**
 * Sanitize claim text for inclusion in prompt.
 */
function sanitizeClaimText(claim: string): string {
  let sanitized = claim
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (sanitized.length > MAX_CLAIM_LENGTH) {
    sanitized = sanitized.substring(0, MAX_CLAIM_LENGTH) + "...";
  }

  return sanitized;
}

/**
 * Generate a label for a cluster of claims using LLM.
 */
export async function generateThemeLabel(
  claims: Array<{ subject: string; predicate: string; object: string }>,
  model?: string
): Promise<ThemeLabel> {
  const agent = getLabelerAgent(model || DEFAULT_MODEL);

  // Format claims for the prompt
  const claimTexts = claims
    .slice(0, MAX_CLAIMS_FOR_LABELING)
    .map((c) => {
      const text = `${c.subject} ${c.predicate.replace(/-/g, " ")} ${c.object}`;
      return `- ${sanitizeClaimText(text)}`;
    })
    .join("\n");

  const prompt = `Analyze this cluster of related claims and generate a theme label.

<claims>
${claimTexts}
</claims>

Generate a concise theme label in JSON format:
{
  "name": "Short theme name (2-4 words, capitalize main words)",
  "description": "One sentence describing what connects these claims",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}

Requirements:
- The name should be concise and descriptive (e.g., "Memory Safety", "Build Tool Performance")
- The description should explain the common thread connecting these claims
- Provide 3-5 keywords that users might search for to find this theme
- Focus on the technical/topical content, not meta-descriptions

Respond only with valid JSON.`;

  try {
    const result = await agent.generate(prompt);
    const text = typeof result === "string" ? result : result.text;

    // Fallback based on most common subjects
    const fallback = generateFallbackLabel(claims);

    const { data, success } = parseLLMJson(text, ThemeLabelSchema, fallback);

    if (!success) {
      console.warn("Theme labeling parsing failed, using fallback");
    }

    return {
      name: data.name || fallback.name,
      description: data.description || fallback.description,
      keywords: Array.isArray(data.keywords) ? data.keywords.slice(0, 5) : [],
    };
  } catch (error) {
    console.warn("Theme labeling failed:", error);
    return generateFallbackLabel(claims);
  }
}

/**
 * Generate a fallback label based on most common subjects.
 */
function generateFallbackLabel(
  claims: Array<{ subject: string; predicate: string; object: string }>
): ThemeLabel {
  const subjects = claims.map((c) => c.subject);
  const commonSubject = mostFrequent(subjects) || "Mixed";

  const predicates = claims.map((c) => c.predicate);
  const commonPredicate = mostFrequent(predicates);

  const uniqueSubjects = [...new Set(subjects)].slice(0, 5);

  return {
    name: `${commonSubject} Topics`,
    description: commonPredicate
      ? `Claims where various subjects ${commonPredicate.replace(/-/g, " ")} ${commonSubject}`
      : `Claims related to ${commonSubject}`,
    keywords: uniqueSubjects,
  };
}

/**
 * Find most frequent string in an array.
 */
function mostFrequent(arr: string[]): string | null {
  const counts = new Map<string, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  let maxCount = 0;
  let maxItem: string | null = null;

  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxItem = item;
    }
  }

  return maxItem;
}

/**
 * Batch label multiple themes.
 * Processes sequentially to avoid rate limits.
 */
export async function generateThemeLabels(
  clusters: Array<
    Array<{ subject: string; predicate: string; object: string }>
  >,
  options: { model?: string; delayMs?: number } = {}
): Promise<ThemeLabel[]> {
  const { model, delayMs = 100 } = options;
  const labels: ThemeLabel[] = [];

  for (const cluster of clusters) {
    try {
      const label = await generateThemeLabel(cluster, model);
      labels.push(label);
    } catch (error) {
      console.warn("Failed to generate theme label:", error);
      labels.push(generateFallbackLabel(cluster));
    }

    // Small delay between requests to respect rate limits
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return labels;
}

/**
 * Reset cached agents (useful for testing).
 */
export function resetLabelerAgent(): void {
  agentCache.clear();
}
