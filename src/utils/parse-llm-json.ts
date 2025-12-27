import { z, type ZodSchema } from "zod";

/**
 * Robustly extracts and validates JSON from LLM text responses.
 * Handles common LLM output patterns like markdown code blocks, extra text, etc.
 */
export function parseLLMJson<T>(
  text: string,
  schema: ZodSchema<T>,
  fallback: T
): { data: T; success: boolean; error?: string } {
  // Strategy 1: Try parsing the entire response as JSON
  try {
    const parsed = JSON.parse(text);
    const validated = schema.parse(parsed);
    return { data: validated, success: true };
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Extract JSON from markdown code blocks
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      const validated = schema.parse(parsed);
      return { data: validated, success: true };
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 3: Find the first complete JSON object
  const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      const parsed = JSON.parse(jsonObjectMatch[0]);
      const validated = schema.parse(parsed);
      return { data: validated, success: true };
    } catch {
      // Continue to next strategy
    }
  }

  // Strategy 4: Try to find balanced braces (handles nested objects)
  const balancedJson = extractBalancedJson(text);
  if (balancedJson) {
    try {
      const parsed = JSON.parse(balancedJson);
      const validated = schema.parse(parsed);
      return { data: validated, success: true };
    } catch {
      // Fall through to fallback
    }
  }

  return {
    data: fallback,
    success: false,
    error: "Failed to parse JSON from LLM response",
  };
}

/**
 * Extracts a balanced JSON object from text by counting braces
 */
function extractBalancedJson(text: string): string | null {
  const startIdx = text.indexOf("{");
  if (startIdx === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(startIdx, i + 1);
      }
    }
  }

  return null;
}

// Schemas for LLM responses
export const SummaryResponseSchema = z.object({
  summary: z.string(),
  notable_comments: z.array(z.string()).optional().default([]),
  sentiment: z.enum(["positive", "negative", "mixed", "neutral"]).optional().default("neutral"),
  key_topics: z.array(z.string()).optional().default([]),
  // Quality confidence scoring fields
  confidence: z.number().min(0).max(1).optional().default(0.7),
  controversy_level: z.enum(["none", "low", "medium", "high"]).optional().default("none"),
  information_density: z.enum(["sparse", "moderate", "rich"]).optional().default("moderate"),
  missing_context: z.array(z.string()).optional().default([]),
});

export type SummaryResponse = z.infer<typeof SummaryResponseSchema>;

export const ClaimSchema = z.object({
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  confidence: z.number().min(0).max(1).optional().default(0.5),
  source_stance: z.enum(["agrees", "disagrees", "neutral", "uncertain"]).optional().default("neutral"),
});

export const ExtractedClaimsSchema = z.object({
  claims: z.array(ClaimSchema).optional().default([]),
  commenter_stances: z
    .object({
      agree_percentage: z.number().optional(),
      disagree_percentage: z.number().optional(),
      notable_camps: z.array(z.any()).optional(),
    })
    .optional()
    .default({}),
});

export type ExtractedClaims = z.infer<typeof ExtractedClaimsSchema>;
