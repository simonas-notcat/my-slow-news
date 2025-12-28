/**
 * Similarity search utilities for claim embeddings.
 * Provides functions for finding similar claims and computing similarity scores.
 */

import type Surreal from "surrealdb";
import type { ClaimRecord } from "../types";

/**
 * A claim with its similarity score
 */
export interface SimilarClaim {
  claim: ClaimRecord;
  similarity: number;
}

/**
 * Options for similarity search
 */
export interface SimilaritySearchOptions {
  /** Maximum number of results to return (default: 10) */
  limit?: number;
  /** Minimum similarity threshold (default: 0.5) */
  minSimilarity?: number;
  /** Claim IDs to exclude from results */
  excludeIds?: string[];
  /** Only search canonical claims (default: true) */
  canonicalOnly?: boolean;
}

/**
 * Find claims similar to the given embedding vector.
 *
 * Uses SurrealDB's vector similarity functions to find claims
 * with embeddings close to the provided vector.
 *
 * @param db - SurrealDB connection
 * @param embedding - The embedding vector to search against
 * @param options - Search options (limit, minSimilarity, excludeIds)
 * @returns Array of similar claims with their similarity scores
 */
export async function findSimilarClaims(
  db: Surreal,
  embedding: number[],
  options: SimilaritySearchOptions = {},
): Promise<SimilarClaim[]> {
  const {
    limit = 10,
    minSimilarity = 0.5,
    excludeIds = [],
    canonicalOnly = true,
  } = options;

  // Build the WHERE clause conditions
  const conditions = ["embedding IS NOT NONE"];
  if (canonicalOnly) {
    conditions.push("is_canonical = true");
  }
  if (excludeIds.length > 0) {
    conditions.push("id NOT IN $excludeIds");
  }

  const whereClause = conditions.join(" AND ");

  // SurrealDB vector similarity search using cosine similarity
  const query = `
    SELECT
      *,
      vector::similarity::cosine(embedding, $embedding) AS similarity
    FROM claim
    WHERE ${whereClause}
    ORDER BY similarity DESC
    LIMIT $limit
  `;

  const results = await db.query<[Array<ClaimRecord & { similarity: number }>]>(
    query,
    {
      embedding,
      limit,
      excludeIds,
    },
  );

  const claims = results[0] || [];

  // Filter by minimum similarity and map to SimilarClaim structure
  return claims
    .filter((r) => r.similarity >= minSimilarity)
    .map((r) => ({
      claim: {
        id: r.id,
        subject: r.subject,
        predicate: r.predicate,
        object: r.object,
        confidence: r.confidence,
        extracted_at: r.extracted_at,
        embedding: r.embedding,
        embedding_model: r.embedding_model,
        embedded_at: r.embedded_at,
        canonical_claim: r.canonical_claim,
        is_canonical: r.is_canonical,
      },
      similarity: r.similarity,
    }));
}

/**
 * Compute cosine similarity between two embedding vectors.
 *
 * Cosine similarity measures the angle between two vectors:
 * - 1.0 = identical direction (most similar)
 * - 0.0 = perpendicular (unrelated)
 * - -1.0 = opposite direction (most dissimilar)
 *
 * @param a - First embedding vector
 * @param b - Second embedding vector
 * @returns Cosine similarity score between -1 and 1
 * @throws Error if vectors have different dimensions
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Embeddings must have same dimension: got ${a.length} and ${b.length}`,
    );
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  // Handle zero vectors
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Compute Euclidean distance between two embedding vectors.
 *
 * Lower values indicate more similar vectors:
 * - 0.0 = identical vectors
 * - Higher values = more different
 *
 * @param a - First embedding vector
 * @param b - Second embedding vector
 * @returns Euclidean distance (>= 0)
 * @throws Error if vectors have different dimensions
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Embeddings must have same dimension: got ${a.length} and ${b.length}`,
    );
  }

  let sumSquares = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sumSquares += diff * diff;
  }

  return Math.sqrt(sumSquares);
}

/**
 * Normalize a vector to unit length (L2 normalization).
 * Useful for preparing vectors for cosine similarity comparison.
 *
 * @param v - Vector to normalize
 * @returns Normalized vector with unit length
 */
export function normalizeVector(v: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < v.length; i++) {
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm);

  // Handle zero vector
  if (norm === 0) {
    return v.slice();
  }

  return v.map((x) => x / norm);
}
