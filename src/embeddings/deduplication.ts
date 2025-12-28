/**
 * Claim deduplication service using semantic embeddings.
 *
 * Detects and manages duplicate claims by comparing embeddings,
 * linking duplicates to canonical claims, and tracking relationships.
 */

import type Surreal from "surrealdb";
import type { ClaimRecord, ClaimSimilarityRecord } from "../types";
import type { EmbeddingService } from "./index";
import { formatClaimForEmbedding } from "./claim-formatter";
import { findSimilarClaims, cosineSimilarity, type SimilarClaim } from "./similarity";

/**
 * Configuration for deduplication thresholds
 */
export interface DeduplicationConfig {
  /** Similarity threshold for considering claims as duplicates (e.g., 0.92) */
  duplicateThreshold: number;
  /** Similarity threshold for considering claims as related (e.g., 0.75) */
  relatedThreshold: number;
}

/**
 * Result of processing a new claim through deduplication
 */
export interface DeduplicationResult {
  /** Whether this is a new canonical claim (not a duplicate) */
  isNew: boolean;
  /** The claim record (canonical claim if duplicate, new claim if not) */
  claim: ClaimRecord;
  /** If duplicate, the canonical claim this is linked to */
  duplicateOf?: ClaimRecord;
  /** Claims related to this one (similarity between related and duplicate thresholds) */
  relatedClaims: SimilarClaim[];
}

/**
 * Progress callback for batch operations
 */
export type ProgressCallback = (processed: number, total: number) => void;

/**
 * Service for detecting and managing duplicate claims using embeddings.
 */
export class ClaimDeduplicationService {
  constructor(
    private db: Surreal,
    private embeddings: EmbeddingService,
    private config: DeduplicationConfig,
  ) {}

  /**
   * Process a new claim through deduplication.
   *
   * 1. Generates an embedding for the claim
   * 2. Searches for similar existing claims
   * 3. If a duplicate is found (similarity >= duplicateThreshold), links to it
   * 4. Otherwise, creates a new canonical claim
   *
   * @param claim - The claim to process
   * @returns Deduplication result with the canonical claim
   */
  async processNewClaim(claim: {
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
  }): Promise<DeduplicationResult> {
    // Generate embedding for the new claim
    const claimText = formatClaimForEmbedding(claim);
    const { embedding } = await this.embeddings.embed(claimText);

    // Search for similar existing claims
    const similar = await findSimilarClaims(this.db, embedding, {
      limit: 10,
      minSimilarity: this.config.relatedThreshold,
      canonicalOnly: true,
    });

    // Check for duplicates (high similarity)
    const duplicate = similar.find(
      (s) => s.similarity >= this.config.duplicateThreshold,
    );

    if (duplicate) {
      // This claim is a duplicate - link it instead of creating new
      return await this.handleDuplicate(claim, embedding, duplicate);
    }

    // No duplicate - create new canonical claim
    return await this.createNewClaim(claim, embedding, similar);
  }

  /**
   * Handle a claim that's a duplicate of an existing one.
   * Creates a non-canonical claim linked to the existing canonical claim.
   */
  private async handleDuplicate(
    claim: {
      subject: string;
      predicate: string;
      object: string;
      confidence: number;
    },
    embedding: number[],
    duplicate: SimilarClaim,
  ): Promise<DeduplicationResult> {
    // Create the claim as non-canonical, linked to the duplicate
    const [created] = await this.db.query<[ClaimRecord[]]>(
      `
      CREATE claim SET
        subject = $subject,
        predicate = $predicate,
        object = $object,
        confidence = $confidence,
        embedding = $embedding,
        embedding_model = $model,
        embedded_at = time::now(),
        extracted_at = time::now(),
        is_canonical = false,
        canonical_claim = $canonical
      `,
      {
        subject: claim.subject,
        predicate: claim.predicate,
        object: claim.object,
        confidence: claim.confidence,
        embedding,
        model: this.embeddings.name,
        canonical: duplicate.claim.id,
      },
    );

    const newClaim = created[0];

    // Create similarity relation
    await this.db.query(
      `
      RELATE $from->claim_similarity->$to SET
        similarity = $similarity,
        relationship = 'duplicate',
        detected_at = time::now()
      `,
      {
        from: newClaim.id,
        to: duplicate.claim.id,
        similarity: duplicate.similarity,
      },
    );

    // Update canonical claim confidence if new claim has higher confidence
    if (claim.confidence > duplicate.claim.confidence) {
      await this.db.query(
        `
        UPDATE $id SET confidence = $confidence
        `,
        {
          id: duplicate.claim.id,
          confidence: claim.confidence,
        },
      );
    }

    return {
      isNew: false,
      claim: duplicate.claim,
      duplicateOf: duplicate.claim,
      relatedClaims: [],
    };
  }

  /**
   * Create a new canonical claim and link related claims.
   */
  private async createNewClaim(
    claim: {
      subject: string;
      predicate: string;
      object: string;
      confidence: number;
    },
    embedding: number[],
    related: SimilarClaim[],
  ): Promise<DeduplicationResult> {
    // Create new canonical claim
    const [created] = await this.db.query<[ClaimRecord[]]>(
      `
      CREATE claim SET
        subject = $subject,
        predicate = $predicate,
        object = $object,
        confidence = $confidence,
        embedding = $embedding,
        embedding_model = $model,
        embedded_at = time::now(),
        extracted_at = time::now(),
        is_canonical = true
      `,
      {
        subject: claim.subject,
        predicate: claim.predicate,
        object: claim.object,
        confidence: claim.confidence,
        embedding,
        model: this.embeddings.name,
      },
    );

    const newClaim = created[0];

    // Create similarity relations for related claims
    for (const rel of related) {
      await this.db.query(
        `
        RELATE $from->claim_similarity->$to SET
          similarity = $similarity,
          relationship = 'related',
          detected_at = time::now()
        `,
        {
          from: newClaim.id,
          to: rel.claim.id,
          similarity: rel.similarity,
        },
      );
    }

    return {
      isNew: true,
      claim: newClaim,
      relatedClaims: related,
    };
  }

  /**
   * Backfill embeddings for existing claims without them.
   *
   * Processes claims in batches to avoid memory issues with large datasets.
   *
   * @param options.batchSize - Number of claims to process at once (default: 50)
   * @param options.onProgress - Callback for progress updates
   * @returns Stats on processed and errored claims
   */
  async backfillEmbeddings(
    options: {
      batchSize?: number;
      onProgress?: ProgressCallback;
    } = {},
  ): Promise<{ processed: number; errors: number }> {
    const { batchSize = 50, onProgress } = options;

    // Get claims without embeddings
    const [claims] = await this.db.query<[ClaimRecord[]]>(`
      SELECT * FROM claim
      WHERE embedding IS NONE AND is_canonical = true
    `);

    const total = claims.length;
    let processed = 0;
    let errors = 0;

    if (total === 0) {
      return { processed: 0, errors: 0 };
    }

    // Process in batches
    for (let i = 0; i < claims.length; i += batchSize) {
      const batch = claims.slice(i, i + batchSize);
      const texts = batch.map((c) =>
        formatClaimForEmbedding({
          subject: c.subject,
          predicate: c.predicate,
          object: c.object,
        }),
      );

      try {
        const results = await this.embeddings.embedBatch(texts);

        for (let j = 0; j < batch.length; j++) {
          await this.db.query(
            `
            UPDATE $id SET
              embedding = $embedding,
              embedding_model = $model,
              embedded_at = time::now()
            `,
            {
              id: batch[j].id,
              embedding: results[j].embedding,
              model: results[j].model,
            },
          );
        }

        processed += batch.length;
      } catch (error) {
        console.error(`Error embedding batch at ${i}:`, error);
        errors += batch.length;
      }

      onProgress?.(processed + errors, total);
    }

    return { processed, errors };
  }

  /**
   * Detect duplicates among existing claims using vector similarity search.
   *
   * Uses SurrealDB's vector index for O(n) performance instead of O(n²) pairwise
   * comparison. For each claim, queries the vector index for similar claims.
   *
   * @param options.maxClaims - Limit claims to process (default: 1000)
   * @param options.onProgress - Progress callback
   * @returns Duplicate pairs found and whether results were truncated
   */
  async detectExistingDuplicates(
    options: {
      maxClaims?: number;
      onProgress?: ProgressCallback;
    } = {},
  ): Promise<{
    duplicatePairs: Array<{
      claim1: ClaimRecord;
      claim2: ClaimRecord;
      similarity: number;
    }>;
    truncated: boolean;
  }> {
    const { maxClaims = 1000, onProgress } = options;
    const duplicatePairs: Array<{
      claim1: ClaimRecord;
      claim2: ClaimRecord;
      similarity: number;
    }> = [];

    // Track pairs we've already found to avoid duplicates (a,b) and (b,a)
    const seenPairs = new Set<string>();

    // Get all canonical claims with embeddings
    const [allClaims] = await this.db.query<[ClaimRecord[]]>(
      `
      SELECT * FROM claim
      WHERE embedding IS NOT NONE AND is_canonical = true
      LIMIT $limit
      `,
      { limit: maxClaims + 1 },
    );

    const truncated = allClaims.length > maxClaims;
    const claims = allClaims.slice(0, maxClaims);
    const total = claims.length;

    // Use vector similarity search for each claim (O(n) with vector index)
    for (let i = 0; i < claims.length; i++) {
      const claim = claims[i];

      if (!claim.embedding || !claim.id) {
        continue;
      }

      // Find similar claims using vector index
      const similar = await findSimilarClaims(this.db, claim.embedding, {
        limit: 10,
        minSimilarity: this.config.duplicateThreshold,
        excludeIds: [claim.id as string],
        canonicalOnly: true,
      });

      // Add unique duplicate pairs
      for (const match of similar) {
        if (!match.claim.id) continue;

        // Create canonical pair key (smaller id first)
        const ids = [claim.id as string, match.claim.id as string].sort();
        const pairKey = `${ids[0]}:${ids[1]}`;

        if (!seenPairs.has(pairKey)) {
          seenPairs.add(pairKey);
          duplicatePairs.push({
            claim1: claim,
            claim2: match.claim,
            similarity: match.similarity,
          });
        }
      }

      onProgress?.(i + 1, total);
    }

    return { duplicatePairs, truncated };
  }

  /**
   * Get embedding statistics for claims.
   */
  async getStats(): Promise<{
    total: number;
    withEmbedding: number;
    canonical: number;
    duplicates: number;
  }> {
    const [results] = await this.db.query<
      [
        Array<{
          total: number;
          with_embedding: number;
          canonical: number;
          duplicates: number;
        }>,
      ]
    >(`
      SELECT
        count() AS total,
        count(embedding IS NOT NONE) AS with_embedding,
        count(is_canonical = true) AS canonical,
        count(is_canonical = false) AS duplicates
      FROM claim
      GROUP ALL
    `);

    const stats = results[0] || {
      total: 0,
      with_embedding: 0,
      canonical: 0,
      duplicates: 0,
    };

    return {
      total: stats.total,
      withEmbedding: stats.with_embedding,
      canonical: stats.canonical,
      duplicates: stats.duplicates,
    };
  }

  /**
   * Result of a merge operation
   */
  /**
   * Merge a duplicate claim into a canonical one.
   *
   * This:
   * 1. Updates the duplicate's canonical_claim field
   * 2. Creates a similarity relation
   * 3. Optionally merges stance data (skipping conflicts)
   *
   * @param duplicateId - ID of the claim to mark as duplicate
   * @param canonicalId - ID of the canonical claim
   * @param mergeStances - Whether to merge stance data (default: true)
   * @returns Merge result with conflict information
   */
  async mergeDuplicate(
    duplicateId: string,
    canonicalId: string,
    mergeStances = true,
  ): Promise<{
    merged: boolean;
    stancesMoved: number;
    stanceConflicts: number;
  }> {
    // Get both claims
    const [claims] = await this.db.query<[ClaimRecord[]]>(
      `SELECT * FROM claim WHERE id IN [$duplicate, $canonical]`,
      { duplicate: duplicateId, canonical: canonicalId },
    );

    if (claims.length !== 2) {
      throw new Error("One or both claims not found");
    }

    const duplicateClaim = claims.find((c) => c.id === duplicateId);
    const canonicalClaim = claims.find((c) => c.id === canonicalId);

    if (!duplicateClaim || !canonicalClaim) {
      throw new Error("Claims not found");
    }

    // Calculate similarity if both have embeddings
    let similarity = 0;
    if (duplicateClaim.embedding && canonicalClaim.embedding) {
      similarity = cosineSimilarity(
        duplicateClaim.embedding,
        canonicalClaim.embedding,
      );
    }

    // Update duplicate claim
    await this.db.query(
      `
      UPDATE $id SET
        is_canonical = false,
        canonical_claim = $canonical
      `,
      {
        id: duplicateId,
        canonical: canonicalId,
      },
    );

    // Create similarity relation
    await this.db.query(
      `
      RELATE $from->claim_similarity->$to SET
        similarity = $similarity,
        relationship = 'duplicate',
        detected_at = time::now()
      `,
      {
        from: duplicateId,
        to: canonicalId,
        similarity,
      },
    );

    let stancesMoved = 0;
    let stanceConflicts = 0;

    if (mergeStances) {
      // Find stances on duplicate claim that would conflict with canonical
      // A conflict occurs when the same user has stances on both claims
      const [conflictingStances] = await this.db.query<
        [Array<{ id: string }>]
      >(
        `
        SELECT id FROM claim_stances
        WHERE claim = $duplicate
          AND user_stance IS NOT NONE
          AND (SELECT id FROM claim_stances
               WHERE claim = $canonical
                 AND user_stance IS NOT NONE) CONTAINS id
        `,
        {
          duplicate: duplicateId,
          canonical: canonicalId,
        },
      );

      stanceConflicts = conflictingStances.length;

      // Move only non-conflicting stances from duplicate to canonical
      // Stances without user_stance (only community data) are always moved
      const [movedResult] = await this.db.query<[Array<{ count: number }>]>(
        `
        UPDATE claim_stances SET claim = $canonical
        WHERE claim = $duplicate
          AND (user_stance IS NONE
               OR id NOT IN (SELECT id FROM claim_stances
                             WHERE claim = $canonical
                               AND user_stance IS NOT NONE))
        RETURN { count: count() }
        `,
        {
          duplicate: duplicateId,
          canonical: canonicalId,
        },
      );

      stancesMoved = movedResult[0]?.count ?? 0;
    }

    return {
      merged: true,
      stancesMoved,
      stanceConflicts,
    };
  }
}
