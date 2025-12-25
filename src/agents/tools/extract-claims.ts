import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { ClaimRecord } from "../../types";

// Schema for extracted claims
export const ClaimSchema = z.object({
  subject: z.string().describe("The entity making or receiving the claim"),
  predicate: z.string().describe("The relationship or action"),
  object: z.string().describe("The target of the claim"),
  confidence: z.number().min(0).max(1).describe("Confidence score 0-1"),
  source_stance: z.enum(["agrees", "disagrees", "neutral", "uncertain"]).describe("Author's stance"),
});

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
  }),
  execute: async ({ context }) => {
    const { claims } = context;

    // Filter out low-confidence claims
    const validClaims = claims.filter((c) => c.confidence >= 0.5);

    return {
      valid_claims: validClaims,
      invalid_count: claims.length - validClaims.length,
    };
  },
});
