/**
 * Types for contradiction detection between claims.
 */

export type ContradictionType =
  | "direct" // Exact opposite predicates (supports vs opposes)
  | "semantic" // LLM-detected semantic opposition
  | "negation" // Explicit negation ("X has Y" vs "X lacks Y")
  | "comparative"; // Opposing comparisons ("A > B" vs "B > A")

export interface ContradictionPair {
  claim1: {
    id: string;
    subject: string;
    predicate: string;
    object: string;
  };
  claim2: {
    id: string;
    subject: string;
    predicate: string;
    object: string;
  };
  similarity: number;
  contradictionType: ContradictionType;
  confidence: number;
  explanation?: string;
  detectedAt: Date;
}

export interface ContradictionDetectionOptions {
  /** Minimum semantic similarity to consider (default: 0.7) */
  minSimilarity?: number;
  /** Use LLM for semantic contradiction check (default: true) */
  useLlmVerification?: boolean;
  /** Batch size for processing (default: 100) */
  batchSize?: number;
  /** Max contradictions to return (default: 100) */
  limit?: number;
  /** Max claims to process for pairwise detection (default: 500) */
  maxClaims?: number;
}

export interface ContradictionStats {
  totalContradictions: number;
  byType: Record<ContradictionType, number>;
  mostContestedSubjects: Array<{ subject: string; count: number }>;
  mostContestedPredicates: Array<{ predicate: string; count: number }>;
}

export interface LlmVerificationResult {
  isContradiction: boolean;
  confidence: number;
  explanation: string;
}
