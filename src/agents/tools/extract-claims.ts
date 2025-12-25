import { createTool } from "@mastra/core/tools";
import { z } from "zod";

// Strict ClaimSchema for tool validation - all fields required.
// Note: parse-llm-json.ts has a lenient version with optional defaults for LLM parsing.
// These are intentionally separate: strict for validated inputs, lenient for LLM outputs.
export const ClaimSchema = z.object({
  subject: z.string(),
  predicate: z.string(),
  object: z.string(),
  confidence: z.number().min(0).max(1),
  source_stance: z.enum(["agrees", "disagrees", "neutral", "uncertain"]),
});

// Type alias for consistency with the base schema
export type Claim = z.infer<typeof ClaimSchema>;

export const extractClaimsTool = createTool({
  id: "format-claims",
  description: "Format and validate extracted claims for storage",
  inputSchema: z.object({
    claims: z.array(ClaimSchema).describe("Array of extracted claims"),
    post_id: z.string().describe("The source post ID"),
  }),
  outputSchema: z.object({
    valid_claims: z.array(ClaimSchema),
    invalid_count: z.number(),
    post_id: z.string(),
  }),
  execute: async ({ context }) => {
    const { claims, post_id } = context;

    // Filter out low-confidence claims
    const validClaims = claims.filter((c) => c.confidence >= 0.5);

    return {
      valid_claims: validClaims,
      invalid_count: claims.length - validClaims.length,
      post_id,
    };
  },
});
