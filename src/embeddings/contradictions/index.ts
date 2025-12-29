/**
 * Contradiction detection module.
 * Detects and manages contradicting claims in the knowledge base.
 */

export { ContradictionDetectionService } from "./service";
export {
  verifyContradictionWithLLM,
  createContradictionVerifier,
  resetVerifierAgent,
} from "./llm-verifier";
export {
  arePredicatesOpposite,
  areObjectsNegated,
  isComparativePredicate,
  getOppositePredicates,
  PREDICATE_OPPOSITES,
  COMPARATIVE_PREDICATES,
  NEGATION_PATTERNS,
} from "./predicate-opposites";
export type {
  ContradictionType,
  ContradictionPair,
  ContradictionDetectionOptions,
  ContradictionStats,
  LlmVerificationResult,
} from "./types";
