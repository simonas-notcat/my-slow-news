/**
 * Contradiction detection service.
 * Finds and manages contradicting claims in the knowledge base.
 */

import type Surreal from "surrealdb";
import type { ClaimRecord } from "../../types";
import { cosineSimilarity } from "../similarity";
import {
  arePredicatesOpposite,
  areObjectsNegated,
  isComparativePredicate,
} from "./predicate-opposites";
import type {
  ContradictionPair,
  ContradictionType,
  ContradictionDetectionOptions,
  ContradictionStats,
  LlmVerificationResult,
} from "./types";

/** Maximum claims for pairwise detection before warning */
const PAIRWISE_CLAIM_LIMIT = 500;

/** Default retry configuration for LLM calls */
const LLM_RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

export class ContradictionDetectionService {
  constructor(
    private db: Surreal,
    private llmVerify?: (
      claim1: string,
      claim2: string
    ) => Promise<LlmVerificationResult>
  ) {}

  /**
   * Detect contradictions among claims.
   *
   * PERFORMANCE WARNING: This method has O(n²) time complexity where n = number of claims.
   * - 100 claims = ~5,000 comparisons
   * - 500 claims = ~125,000 comparisons
   * - 1,000 claims = ~500,000 comparisons
   *
   * For datasets larger than 500 claims, consider using `detectContradictionsOptimized()`
   * which leverages vector index queries for better performance.
   *
   * @param options.maxClaims - Limit claims to process (default: 500, max: 1000)
   */
  async detectContradictions(
    options: ContradictionDetectionOptions = {}
  ): Promise<ContradictionPair[]> {
    const {
      minSimilarity = 0.7,
      useLlmVerification = true,
      limit = 100,
      maxClaims = PAIRWISE_CLAIM_LIMIT,
    } = options;

    const contradictions: ContradictionPair[] = [];

    // Get all canonical claims with embeddings (with limit for safety)
    const claimLimit = Math.min(maxClaims, 1000);
    const [claims] = await this.db.query<[ClaimRecord[]]>(
      `
      SELECT * FROM claim
      WHERE embedding IS NOT NONE AND is_canonical = true
      LIMIT $limit
    `,
      { limit: claimLimit }
    );

    if (!claims || claims.length < 2) {
      return [];
    }

    // Warn if approaching performance limits
    if (claims.length > PAIRWISE_CLAIM_LIMIT) {
      console.warn(
        `Processing ${claims.length} claims with O(n²) algorithm. ` +
          `Consider using detectContradictionsOptimized() for better performance.`
      );
    }

    // Process pairwise comparisons
    for (let i = 0; i < claims.length && contradictions.length < limit; i++) {
      const claim1 = claims[i];

      for (
        let j = i + 1;
        j < claims.length && contradictions.length < limit;
        j++
      ) {
        const claim2 = claims[j];

        // Check semantic similarity first
        const similarity = cosineSimilarity(
          claim1.embedding!,
          claim2.embedding!
        );

        if (similarity < minSimilarity) {
          continue;
        }

        // Check for structural contradictions
        const structuralResult = this.checkStructuralContradiction(
          claim1,
          claim2
        );

        if (structuralResult) {
          contradictions.push({
            claim1: this.claimToSummary(claim1),
            claim2: this.claimToSummary(claim2),
            similarity,
            contradictionType: structuralResult.type,
            confidence: structuralResult.confidence,
            detectedAt: new Date(),
          });
          continue;
        }

        // Use LLM verification for semantic contradictions
        if (useLlmVerification && this.llmVerify) {
          const claimText1 = this.formatClaimText(claim1);
          const claimText2 = this.formatClaimText(claim2);

          const llmResult = await this.verifyWithRetry(claimText1, claimText2);

          if (
            llmResult &&
            llmResult.isContradiction &&
            llmResult.confidence >= 0.7
          ) {
            contradictions.push({
              claim1: this.claimToSummary(claim1),
              claim2: this.claimToSummary(claim2),
              similarity,
              contradictionType: "semantic",
              confidence: llmResult.confidence,
              explanation: llmResult.explanation,
              detectedAt: new Date(),
            });
          }
        }
      }
    }

    return contradictions;
  }

  /**
   * LLM verification with retry logic for transient failures.
   */
  private async verifyWithRetry(
    claim1: string,
    claim2: string
  ): Promise<LlmVerificationResult | null> {
    if (!this.llmVerify) return null;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < LLM_RETRY_CONFIG.maxRetries; attempt++) {
      try {
        return await this.llmVerify(claim1, claim2);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const isRetryable = this.isRetryableError(lastError);

        if (!isRetryable || attempt === LLM_RETRY_CONFIG.maxRetries - 1) {
          console.warn(
            `LLM verification failed after ${attempt + 1} attempts:`,
            lastError.message
          );
          return null;
        }

        // Exponential backoff
        const delay = Math.min(
          LLM_RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
          LLM_RETRY_CONFIG.maxDelayMs
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    return null;
  }

  /**
   * Check if an error is retryable (transient).
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return (
      message.includes("rate limit") ||
      message.includes("timeout") ||
      message.includes("429") ||
      message.includes("500") ||
      message.includes("502") ||
      message.includes("503") ||
      message.includes("network") ||
      message.includes("econnreset")
    );
  }

  /**
   * Optimized contradiction detection using vector index queries.
   * More efficient for large datasets (>500 claims).
   *
   * Instead of O(n²) pairwise comparison, this method:
   * 1. Iterates through claims once
   * 2. Uses vector similarity search to find candidates
   * 3. Only checks structural/LLM verification on candidates
   *
   * Complexity: O(n * k) where k is the number of similar candidates per claim
   */
  async detectContradictionsOptimized(
    options: ContradictionDetectionOptions = {}
  ): Promise<ContradictionPair[]> {
    const { minSimilarity = 0.7, useLlmVerification = true, limit = 100 } = options;

    const contradictions: ContradictionPair[] = [];
    const processedPairs = new Set<string>();

    // Get all canonical claims with embeddings
    const [claims] = await this.db.query<[ClaimRecord[]]>(`
      SELECT * FROM claim
      WHERE embedding IS NOT NONE AND is_canonical = true
    `);

    if (!claims || claims.length < 2) {
      return [];
    }

    // Process each claim and find similar ones using vector index
    for (const claim of claims) {
      if (contradictions.length >= limit) break;

      // Use vector similarity search (leverages index)
      const [candidates] = await this.db.query<
        [Array<ClaimRecord & { similarity: number }>]
      >(
        `
        SELECT
          *,
          vector::similarity::cosine(embedding, $embedding) AS similarity
        FROM claim
        WHERE
          embedding IS NOT NONE
          AND is_canonical = true
          AND id != $claimId
          AND vector::similarity::cosine(embedding, $embedding) >= $minSimilarity
        ORDER BY similarity DESC
        LIMIT 20
      `,
        {
          embedding: claim.embedding,
          claimId: claim.id,
          minSimilarity,
        }
      );

      for (const candidate of candidates || []) {
        // Skip if already processed this pair
        const pairKey = [claim.id, candidate.id].sort().join(":");
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        // Check for structural contradictions
        const structuralResult = this.checkStructuralContradiction(
          claim,
          candidate
        );

        if (structuralResult) {
          contradictions.push({
            claim1: this.claimToSummary(claim),
            claim2: this.claimToSummary(candidate),
            similarity: candidate.similarity,
            contradictionType: structuralResult.type,
            confidence: structuralResult.confidence,
            detectedAt: new Date(),
          });
          continue;
        }

        // LLM verification for semantic contradictions
        if (useLlmVerification && this.llmVerify) {
          const llmResult = await this.verifyWithRetry(
            this.formatClaimText(claim),
            this.formatClaimText(candidate)
          );

          if (
            llmResult &&
            llmResult.isContradiction &&
            llmResult.confidence >= 0.7
          ) {
            contradictions.push({
              claim1: this.claimToSummary(claim),
              claim2: this.claimToSummary(candidate),
              similarity: candidate.similarity,
              contradictionType: "semantic",
              confidence: llmResult.confidence,
              explanation: llmResult.explanation,
              detectedAt: new Date(),
            });
          }
        }
      }
    }

    return contradictions;
  }

  /**
   * Find contradictions for a specific claim.
   */
  async findContradictionsFor(
    claimId: string,
    options: { limit?: number; useLlmVerification?: boolean } = {}
  ): Promise<ContradictionPair[]> {
    const { limit = 10, useLlmVerification = true } = options;

    // Get the source claim
    const [sourceClaims] = await this.db.query<[ClaimRecord[]]>(
      `SELECT * FROM claim WHERE id = $claimId`,
      { claimId }
    );

    if (!sourceClaims?.[0]) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    const source = sourceClaims[0];

    if (!source.embedding) {
      throw new Error("Claim has no embedding");
    }

    // Find similar claims
    const [similarClaims] = await this.db.query<
      [Array<ClaimRecord & { similarity: number }>]
    >(
      `
      SELECT
        *,
        vector::similarity::cosine(embedding, $embedding) AS similarity
      FROM claim
      WHERE
        embedding IS NOT NONE
        AND is_canonical = true
        AND id != $claimId
        AND vector::similarity::cosine(embedding, $embedding) >= 0.7
      ORDER BY similarity DESC
      LIMIT 50
    `,
      {
        embedding: source.embedding,
        claimId,
      }
    );

    const contradictions: ContradictionPair[] = [];

    for (const candidate of similarClaims || []) {
      if (contradictions.length >= limit) break;

      // Check structural contradiction
      const structuralResult = this.checkStructuralContradiction(
        source,
        candidate
      );

      if (structuralResult) {
        contradictions.push({
          claim1: this.claimToSummary(source),
          claim2: this.claimToSummary(candidate),
          similarity: candidate.similarity,
          contradictionType: structuralResult.type,
          confidence: structuralResult.confidence,
          detectedAt: new Date(),
        });
        continue;
      }

      // LLM verification for semantic contradictions
      if (useLlmVerification && this.llmVerify) {
        try {
          const llmResult = await this.llmVerify(
            this.formatClaimText(source),
            this.formatClaimText(candidate)
          );

          if (llmResult.isContradiction && llmResult.confidence >= 0.7) {
            contradictions.push({
              claim1: this.claimToSummary(source),
              claim2: this.claimToSummary(candidate),
              similarity: candidate.similarity,
              contradictionType: "semantic",
              confidence: llmResult.confidence,
              explanation: llmResult.explanation,
              detectedAt: new Date(),
            });
          }
        } catch (error) {
          console.warn("LLM verification failed:", error);
        }
      }
    }

    return contradictions;
  }

  /**
   * Get statistics about contradictions in the database.
   */
  async getStats(): Promise<ContradictionStats> {
    const [stats] = await this.db.query<[{ total: number }[]]>(`
      SELECT count() AS total
      FROM claim_similarity
      WHERE relationship = 'contradicts'
      GROUP ALL
    `);

    const [subjectStats] = await this.db.query<
      [{ subject: string; count: number }[]]
    >(`
      SELECT
        in.subject AS subject,
        count() AS count
      FROM claim_similarity
      WHERE relationship = 'contradicts'
      GROUP BY in.subject
      ORDER BY count DESC
      LIMIT 10
    `);

    const [predicateStats] = await this.db.query<
      [{ predicate: string; count: number }[]]
    >(`
      SELECT
        in.predicate AS predicate,
        count() AS count
      FROM claim_similarity
      WHERE relationship = 'contradicts'
      GROUP BY in.predicate
      ORDER BY count DESC
      LIMIT 10
    `);

    return {
      totalContradictions: stats?.[0]?.total || 0,
      byType: {
        direct: 0,
        semantic: 0,
        negation: 0,
        comparative: 0,
      },
      mostContestedSubjects: subjectStats || [],
      mostContestedPredicates: predicateStats || [],
    };
  }

  /**
   * Store a detected contradiction in the database.
   */
  async storeContradiction(contradiction: ContradictionPair): Promise<void> {
    await this.db.query(
      `
      RELATE $from->claim_similarity->$to SET
        similarity = $similarity,
        relationship = 'contradicts',
        contradiction_type = $type,
        confidence = $confidence,
        explanation = $explanation,
        detected_at = $detectedAt
    `,
      {
        from: contradiction.claim1.id,
        to: contradiction.claim2.id,
        similarity: contradiction.similarity,
        type: contradiction.contradictionType,
        confidence: contradiction.confidence,
        explanation: contradiction.explanation || null,
        detectedAt: contradiction.detectedAt.toISOString(),
      }
    );
  }

  /**
   * Get stored contradictions from the database.
   */
  async getStoredContradictions(
    options: { limit?: number } = {}
  ): Promise<ContradictionPair[]> {
    const { limit = 50 } = options;

    const [stored] = await this.db.query<[any[]]>(
      `
      SELECT
        in.id AS claim1_id,
        in.subject AS claim1_subject,
        in.predicate AS claim1_predicate,
        in.object AS claim1_object,
        out.id AS claim2_id,
        out.subject AS claim2_subject,
        out.predicate AS claim2_predicate,
        out.object AS claim2_object,
        similarity,
        contradiction_type,
        confidence,
        explanation,
        detected_at
      FROM claim_similarity
      WHERE relationship = 'contradicts'
      ORDER BY confidence DESC
      LIMIT $limit
    `,
      { limit }
    );

    return (stored || []).map((r) => ({
      claim1: {
        id: r.claim1_id,
        subject: r.claim1_subject,
        predicate: r.claim1_predicate,
        object: r.claim1_object,
      },
      claim2: {
        id: r.claim2_id,
        subject: r.claim2_subject,
        predicate: r.claim2_predicate,
        object: r.claim2_object,
      },
      similarity: r.similarity,
      contradictionType: r.contradiction_type,
      confidence: r.confidence,
      explanation: r.explanation,
      detectedAt: new Date(r.detected_at),
    }));
  }

  /**
   * Check for structural contradictions (predicates, negation, comparison).
   */
  private checkStructuralContradiction(
    claim1: ClaimRecord,
    claim2: ClaimRecord
  ): { type: ContradictionType; confidence: number } | null {
    // Check for opposite predicates with same subject/object
    if (claim1.subject === claim2.subject && claim1.object === claim2.object) {
      if (arePredicatesOpposite(claim1.predicate, claim2.predicate)) {
        return { type: "direct", confidence: 0.95 };
      }
    }

    // Check for comparative reversal (A > B vs B > A)
    if (
      claim1.subject === claim2.object &&
      claim1.object === claim2.subject &&
      claim1.predicate === claim2.predicate &&
      isComparativePredicate(claim1.predicate)
    ) {
      return { type: "comparative", confidence: 0.9 };
    }

    // Check for negation patterns
    if (
      claim1.subject === claim2.subject &&
      claim1.predicate === claim2.predicate
    ) {
      if (areObjectsNegated(claim1.object, claim2.object)) {
        return { type: "negation", confidence: 0.85 };
      }
    }

    return null;
  }

  /**
   * Format claim as readable text.
   */
  private formatClaimText(claim: ClaimRecord): string {
    const predicate = claim.predicate.replace(/-/g, " ");
    return `${claim.subject} ${predicate} ${claim.object}`;
  }

  /**
   * Convert claim to summary object.
   */
  private claimToSummary(claim: ClaimRecord) {
    return {
      id: claim.id as string,
      subject: claim.subject,
      predicate: claim.predicate,
      object: claim.object,
    };
  }
}
