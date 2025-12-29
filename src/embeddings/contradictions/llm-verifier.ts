/**
 * LLM-based contradiction verification.
 * Uses an AI agent to detect semantic contradictions between claims.
 */

import { Agent } from "@mastra/core/agent";
import { parseLLMJson } from "../../utils/parse-llm-json";
import { z } from "zod";
import type { LlmVerificationResult } from "./types";

const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";

const CONTRADICTION_PROMPT = `You are analyzing two claims to determine if they contradict each other.

Claim 1: {claim1}
Claim 2: {claim2}

A contradiction exists when:
1. The claims make opposite assertions about the same subject
2. One claim negates what the other asserts
3. Both claims cannot be true at the same time

Analyze these claims and respond in JSON format:
{
  "isContradiction": true/false,
  "confidence": 0.0-1.0,
  "explanation": "Brief explanation of why they do or don't contradict",
  "contradictionType": "direct" | "semantic" | "contextual" | "none"
}

Important:
- "direct" = explicit opposite claims (e.g., "X supports Y" vs "X opposes Y")
- "semantic" = same meaning expressed oppositely (e.g., "X is fast" vs "X is slow")
- "contextual" = contradicts only in certain contexts
- "none" = no contradiction

Be conservative - only mark as contradiction if clearly incompatible.
Respond only with valid JSON.`;

const VerificationResultSchema = z.object({
  isContradiction: z.boolean(),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
  contradictionType: z.enum(["direct", "semantic", "contextual", "none"]),
});

// Cached agent instance
let verifierAgent: Agent | null = null;

/**
 * Creates or returns the cached verifier agent.
 */
function getVerifierAgent(model?: string): Agent {
  if (!verifierAgent) {
    verifierAgent = new Agent({
      name: "contradiction-verifier",
      instructions:
        "You are a logical analysis assistant that determines if two claims contradict each other. Respond only with JSON.",
      model: (model || DEFAULT_MODEL) as any,
    });
  }
  return verifierAgent;
}

/**
 * Verify if two claims contradict each other using LLM analysis.
 *
 * @param claim1 - First claim in natural language
 * @param claim2 - Second claim in natural language
 * @param model - Optional model override
 * @returns Verification result with contradiction status and confidence
 */
export async function verifyContradictionWithLLM(
  claim1: string,
  claim2: string,
  model?: string
): Promise<LlmVerificationResult> {
  const agent = getVerifierAgent(model);

  const prompt = CONTRADICTION_PROMPT.replace("{claim1}", claim1).replace(
    "{claim2}",
    claim2
  );

  try {
    const result = await agent.generate(prompt);
    const text = typeof result === "string" ? result : result.text;

    const fallback: LlmVerificationResult = {
      isContradiction: false,
      confidence: 0,
      explanation: "Failed to analyze claims",
    };

    const { data, success } = parseLLMJson(
      text,
      VerificationResultSchema,
      fallback
    );

    if (!success) {
      console.warn(
        "Contradiction verification parsing failed, using fallback"
      );
    }

    return {
      isContradiction: data.isContradiction,
      confidence: data.confidence,
      explanation: data.explanation,
    };
  } catch (error) {
    console.error("Contradiction verification failed:", error);
    return {
      isContradiction: false,
      confidence: 0,
      explanation: "Failed to analyze",
    };
  }
}

/**
 * Create a contradiction verifier function bound to a specific model.
 * Useful for passing to ContradictionDetectionService.
 */
export function createContradictionVerifier(
  model?: string
): (claim1: string, claim2: string) => Promise<LlmVerificationResult> {
  return (claim1: string, claim2: string) =>
    verifyContradictionWithLLM(claim1, claim2, model);
}

/**
 * Reset the cached agent (useful for testing).
 */
export function resetVerifierAgent(): void {
  verifierAgent = null;
}
