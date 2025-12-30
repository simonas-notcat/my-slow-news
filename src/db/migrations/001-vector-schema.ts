import type Surreal from "surrealdb";
import { VECTOR_SCHEMA, getVectorIndexSchema } from "../schema";

/** Default embedding dimensions (OpenAI text-embedding-3-small) */
const DEFAULT_DIMENSIONS = 1536;

/**
 * Migration 001: Add vector schema for semantic features
 *
 * Adds:
 * - Embedding fields to claim table (embedding, embedding_model, embedded_at)
 * - Canonical claim tracking fields (canonical_claim, is_canonical)
 * - claim_similarity relation table for tracking duplicates/related claims
 * - Vector index on claim embeddings (optional, may fail on older SurrealDB versions)
 *
 * @param db - SurrealDB connection
 * @param dimensions - Embedding vector dimensions (default: 1536 for OpenAI, use 768 for Ollama)
 */
export async function migrateVectorSchema(
  db: Surreal,
  dimensions: number = DEFAULT_DIMENSIONS,
): Promise<void> {
  console.log("Applying vector schema migration...");
  console.log(`  Using embedding dimensions: ${dimensions}`);

  try {
    // Helper function to define a field if it doesn't exist
    const defineFieldIfNotExists = async (
      tableName: string,
      fieldName: string,
      fieldType: string,
    ) => {
      try {
        await db.query(
          `DEFINE FIELD ${fieldName} ON ${tableName} TYPE ${fieldType}`,
        );
        console.log(`  Created ${fieldName} field`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("already exists")) {
          console.log(`  Field '${fieldName}' already exists`);
        } else {
          throw error;
        }
      }
    };

    // Helper function to define an index if it doesn't exist
    const defineIndexIfNotExists = async (
      tableName: string,
      indexName: string,
      fields: string,
      indexType?: string,
    ) => {
      try {
        const indexDef = indexType
          ? `DEFINE INDEX ${indexName} ON ${tableName} FIELDS ${fields} ${indexType}`
          : `DEFINE INDEX ${indexName} ON ${tableName} FIELDS ${fields}`;
        await db.query(indexDef);
        console.log(`  Created ${indexName} index`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("already exists")) {
          console.log(`  Index '${indexName}' already exists`);
        } else {
          throw error;
        }
      }
    };

    // Add embedding fields to claim table
    await defineFieldIfNotExists("claim", "embedding", "option<array<float>>");
    await defineFieldIfNotExists("claim", "embedding_model", "option<string>");
    await defineFieldIfNotExists("claim", "embedded_at", "option<datetime>");

    // Add canonical claim tracking fields
    await defineFieldIfNotExists(
      "claim",
      "canonical_claim",
      "option<record<claim>>",
    );
    await defineFieldIfNotExists("claim", "is_canonical", "bool DEFAULT true");

    // Add canonical claim index
    await defineIndexIfNotExists("claim", "idx_claim_is_canonical", "is_canonical");

    // Create claim_similarity relation table
    try {
      await db.query(`
        DEFINE TABLE claim_similarity TYPE RELATION FROM claim TO claim SCHEMAFULL;
        DEFINE FIELD similarity ON claim_similarity TYPE float;
        DEFINE FIELD relationship ON claim_similarity TYPE string;
        DEFINE FIELD detected_at ON claim_similarity TYPE datetime;
        DEFINE INDEX idx_claim_similarity_rel ON claim_similarity FIELDS relationship;
      `);
      console.log("  Created claim_similarity table");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("already exists")) {
        console.log("  Table 'claim_similarity' already exists");
      } else {
        throw error;
      }
    }

    console.log("  Vector fields and relations applied");

    // Try to apply vector index (may fail on older SurrealDB versions)
    try {
      const vectorIndexSchema = getVectorIndexSchema(dimensions);
      await db.query(vectorIndexSchema);
      console.log("  Vector index created");
    } catch (indexError) {
      // Vector index syntax varies between SurrealDB versions or may already exist
      const message =
        indexError instanceof Error ? indexError.message : String(indexError);
      if (message.includes("already exists")) {
        console.log("  Vector index 'idx_claim_embedding' already exists");
      } else {
        // Log warning but don't fail - similarity search will still work (just slower)
        console.warn(
          "  Warning: Could not create vector index. Similarity search will work but may be slower.",
        );
        console.warn(
          "  This is expected on SurrealDB versions < 2.0. Error:",
          message,
        );
      }
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
  } catch (error) {
    // Table or fields don't exist - log for debugging
    console.debug(
      "Vector schema check failed (this is expected on first run):",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}
