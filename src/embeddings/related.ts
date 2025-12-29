import type Surreal from "surrealdb";
import type { ClaimRecord } from "../types";

export interface RelatedClaim {
  claim: ClaimRecord;
  similarity: number;
  relationship: "similar" | "same-subject" | "same-predicate" | "same-object";
}

export interface RelatedClaimsOptions {
  limit?: number;
  minSimilarity?: number;
  excludeDuplicates?: boolean;
}

export interface GroupedRelatedClaims {
  similar: RelatedClaim[]; // Semantically similar (different subject/predicate/object)
  sameSubject: RelatedClaim[]; // Same subject, different claims
  samePredicate: RelatedClaim[]; // Same predicate type
  sameObject: RelatedClaim[]; // Same object, different subjects
}

export class RelatedClaimsService {
  constructor(private db: Surreal) {}

  /**
   * Find claims related to the given claim.
   * Uses embedding similarity and structural relationships.
   */
  async findRelated(
    claimId: string,
    options: RelatedClaimsOptions = {}
  ): Promise<RelatedClaim[]> {
    this.validateClaimId(claimId);

    const {
      limit = 10,
      minSimilarity = 0.6,
      excludeDuplicates = true,
    } = options;

    // Get the source claim with its embedding
    const [sourceClaim] = await this.db.query<[ClaimRecord[]]>(
      `SELECT * FROM claim WHERE id = $claimId`,
      { claimId }
    );

    if (!sourceClaim?.[0]) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    const claim = sourceClaim[0];

    // If claim has no embedding, fall back to structural similarity only
    if (!claim.embedding) {
      return this.findStructurallyRelated(claim, { limit });
    }

    // Build exclusion list (self + duplicates)
    let excludeIds = [claimId];
    if (excludeDuplicates) {
      const [duplicates] = await this.db.query<[Array<{ id: string }>]>(
        `
        SELECT id FROM claim
        WHERE canonical_claim = $claimId OR id IN (
          SELECT in FROM claim_similarity
          WHERE out = $claimId AND relationship = 'duplicate'
        )
      `,
        { claimId }
      );
      excludeIds = excludeIds.concat(duplicates?.map((d) => d.id) || []);
    }

    // Vector similarity search
    const [semanticResults] = await this.db.query<
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
        AND id NOT IN $excludeIds
        AND vector::similarity::cosine(embedding, $embedding) >= $minSimilarity
      ORDER BY similarity DESC
      LIMIT $limit
    `,
      {
        embedding: claim.embedding,
        excludeIds,
        minSimilarity,
        limit: limit * 2, // Fetch more for categorization
      }
    );

    // Categorize by relationship type
    const results: RelatedClaim[] = (semanticResults || []).map((row) => ({
      claim: {
        id: row.id,
        subject: row.subject,
        predicate: row.predicate,
        object: row.object,
        confidence: row.confidence,
        extracted_at: row.extracted_at,
        embedding: row.embedding,
        embedding_model: row.embedding_model,
        embedded_at: row.embedded_at,
        canonical_claim: row.canonical_claim,
        is_canonical: row.is_canonical,
      },
      similarity: row.similarity,
      relationship: this.categorizeRelationship(claim, row),
    }));

    return results.slice(0, limit);
  }

  /**
   * Find related claims grouped by relationship type.
   */
  async findRelatedGrouped(
    claimId: string,
    options: RelatedClaimsOptions = {}
  ): Promise<GroupedRelatedClaims> {
    const related = await this.findRelated(claimId, {
      ...options,
      limit: (options.limit || 10) * 2, // Fetch more for grouping
    });

    const grouped: GroupedRelatedClaims = {
      similar: [],
      sameSubject: [],
      samePredicate: [],
      sameObject: [],
    };

    for (const item of related) {
      switch (item.relationship) {
        case "same-subject":
          grouped.sameSubject.push(item);
          break;
        case "same-predicate":
          grouped.samePredicate.push(item);
          break;
        case "same-object":
          grouped.sameObject.push(item);
          break;
        default:
          grouped.similar.push(item);
      }
    }

    // Limit each group
    const perGroupLimit = Math.ceil((options.limit || 10) / 4);
    grouped.similar = grouped.similar.slice(0, perGroupLimit);
    grouped.sameSubject = grouped.sameSubject.slice(0, perGroupLimit);
    grouped.samePredicate = grouped.samePredicate.slice(0, perGroupLimit);
    grouped.sameObject = grouped.sameObject.slice(0, perGroupLimit);

    return grouped;
  }

  /**
   * Find structurally related claims (same subject/predicate/object).
   * Used as fallback when embeddings aren't available.
   */
  private async findStructurallyRelated(
    claim: ClaimRecord,
    options: { limit: number }
  ): Promise<RelatedClaim[]> {
    const results: RelatedClaim[] = [];

    // Same subject
    const [sameSubject] = await this.db.query<[ClaimRecord[]]>(
      `
      SELECT * FROM claim
      WHERE subject = $subject AND id != $claimId AND is_canonical = true
      LIMIT $limit
    `,
      { subject: claim.subject, claimId: claim.id, limit: options.limit }
    );

    for (const c of sameSubject || []) {
      results.push({
        claim: c,
        similarity: 0.7, // Estimated similarity for same subject
        relationship: "same-subject",
      });
    }

    // Same predicate
    const [samePredicate] = await this.db.query<[ClaimRecord[]]>(
      `
      SELECT * FROM claim
      WHERE predicate = $predicate AND id != $claimId AND is_canonical = true
      LIMIT $limit
    `,
      { predicate: claim.predicate, claimId: claim.id, limit: options.limit }
    );

    for (const c of samePredicate || []) {
      if (!results.find((r) => r.claim.id === c.id)) {
        results.push({
          claim: c,
          similarity: 0.5, // Estimated similarity for same predicate
          relationship: "same-predicate",
        });
      }
    }

    // Same object
    const [sameObject] = await this.db.query<[ClaimRecord[]]>(
      `
      SELECT * FROM claim
      WHERE object = $object AND id != $claimId AND is_canonical = true
      LIMIT $limit
    `,
      { object: claim.object, claimId: claim.id, limit: options.limit }
    );

    for (const c of sameObject || []) {
      if (!results.find((r) => r.claim.id === c.id)) {
        results.push({
          claim: c,
          similarity: 0.5, // Estimated similarity for same object
          relationship: "same-object",
        });
      }
    }

    return results.slice(0, options.limit);
  }

  /**
   * Categorize the relationship between two claims.
   */
  private categorizeRelationship(
    source: ClaimRecord,
    target: ClaimRecord
  ): RelatedClaim["relationship"] {
    if (source.subject === target.subject) {
      return "same-subject";
    }
    if (source.predicate === target.predicate) {
      return "same-predicate";
    }
    if (source.object === target.object) {
      return "same-object";
    }
    return "similar";
  }

  /**
   * Pre-compute and cache related claims for a set of claims.
   * Useful for batch processing.
   *
   * Uses concurrency limiting to avoid overwhelming the database
   * and embedding service.
   */
  async precomputeRelated(
    claimIds: string[],
    options: RelatedClaimsOptions & { concurrencyLimit?: number } = {}
  ): Promise<Map<string, RelatedClaim[]>> {
    const { concurrencyLimit = 5, ...relatedOptions } = options;
    const results = new Map<string, RelatedClaim[]>();

    // Process in batches with concurrency limit
    for (let i = 0; i < claimIds.length; i += concurrencyLimit) {
      const batch = claimIds.slice(i, i + concurrencyLimit);

      const batchResults = await Promise.all(
        batch.map(async (claimId) => {
          try {
            const related = await this.findRelated(claimId, relatedOptions);
            return { claimId, related, error: null };
          } catch (error) {
            console.warn(`Failed to find related for ${claimId}:`, error);
            return { claimId, related: [], error };
          }
        })
      );

      for (const { claimId, related } of batchResults) {
        results.set(claimId, related);
      }

      // Optional: Add small delay between batches to avoid rate limiting
      if (i + concurrencyLimit < claimIds.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Validate claim ID format.
   */
  private validateClaimId(claimId: string): void {
    if (!claimId || typeof claimId !== "string") {
      throw new Error("Claim ID is required");
    }
    if (!claimId.startsWith("claim:")) {
      throw new Error("Invalid claim ID format");
    }
  }
}
