import type Surreal from "surrealdb";
import { VECTOR_SCHEMA, VECTOR_INDEX_SCHEMA } from "../schema";

/**
 * Migration 001: Add vector schema for semantic features
 *
 * Adds:
 * - Embedding fields to claim table (embedding, embedding_model, embedded_at)
 * - Canonical claim tracking fields (canonical_claim, is_canonical)
 * - claim_similarity relation table for tracking duplicates/related claims
 * - Vector index on claim embeddings (optional, may fail on older SurrealDB versions)
 */
export async function migrateVectorSchema(db: Surreal): Promise<void> {
  console.log("Applying vector schema migration...");

  try {
    // Apply core vector schema (fields and relations)
    await db.query(VECTOR_SCHEMA);
    console.log("  Vector fields and relations applied");

    // Try to apply vector index (may fail on older SurrealDB versions)
    try {
      await db.query(VECTOR_INDEX_SCHEMA);
      console.log("  Vector index applied");
    } catch (indexError) {
      // Vector index syntax varies between SurrealDB versions
      // Log warning but don't fail - similarity search will still work (just slower)
      console.warn(
        "  Warning: Could not create vector index. Similarity search will work but may be slower.",
      );
      console.warn(
        "  This is expected on SurrealDB versions < 2.0. Error:",
        indexError instanceof Error ? indexError.message : String(indexError),
      );
    }

    console.log("Vector schema migration completed successfully");
  } catch (error) {
    console.error("Failed to apply vector schema:", error);
    throw error;
  }
}

/**
 * Check if vector schema has already been applied by checking for:
 * 1. The claim_similarity table exists
 * 2. The embedding field exists on claim table
 * 3. The is_canonical field exists on claim table
 */
export async function isVectorSchemaApplied(db: Surreal): Promise<boolean> {
  try {
    // Check if claim_similarity table exists
    const tableResult = await db.query<[Record<string, unknown>]>(
      "INFO FOR TABLE claim_similarity",
    );
    const tableExists =
      tableResult[0] !== undefined && Object.keys(tableResult[0]).length > 0;

    if (!tableExists) {
      return false;
    }

    // Check if embedding and is_canonical fields exist on claim table
    const claimInfo = await db.query<[{ fd: Record<string, unknown> }]>(
      "INFO FOR TABLE claim",
    );

    if (!claimInfo[0]?.fd) {
      return false;
    }

    const fields = claimInfo[0].fd;
    const hasEmbeddingField = "embedding" in fields;
    const hasIsCanonicalField = "is_canonical" in fields;

    return hasEmbeddingField && hasIsCanonicalField;
  } catch {
    // Table or fields don't exist
    return false;
  }
}
