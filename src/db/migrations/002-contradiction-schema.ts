import type Surreal from "surrealdb";

/**
 * Migration 002: Add contradiction-specific fields to claim_similarity
 *
 * Adds:
 * - contradiction_type field (direct, semantic, negation, comparative)
 * - explanation field for LLM-generated explanations
 * - Index for finding contradictions by type
 */
export const CONTRADICTION_SCHEMA = `
-- Add contradiction-specific fields to claim_similarity
DEFINE FIELD contradiction_type ON claim_similarity TYPE option<string>;
DEFINE FIELD explanation ON claim_similarity TYPE option<string>;

-- Index for finding contradictions by relationship
DEFINE INDEX idx_claim_similarity_contradicts ON claim_similarity
  FIELDS relationship
  WHERE relationship = 'contradicts';
`;

/** Migration version for tracking */
export const MIGRATION_VERSION = "002";
export const MIGRATION_NAME = "contradiction-schema";

/** Dependencies: migrations that must be applied before this one */
export const MIGRATION_DEPENDENCIES = ["001-vector-schema"];

/**
 * Check if required dependencies are met.
 */
async function checkDependencies(db: Surreal): Promise<void> {
  try {
    // Check if claim_similarity table exists (from vector schema)
    const tableResult = await db.query<[Record<string, unknown>]>(
      "INFO FOR TABLE claim_similarity"
    );
    const tableExists =
      tableResult[0] !== undefined && Object.keys(tableResult[0]).length > 0;

    if (!tableExists) {
      throw new Error(
        `Migration dependency not met: claim_similarity table not found. ` +
          `Please apply migration 001-vector-schema first.`
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("dependency")) {
      throw error;
    }
    throw new Error(
      `Migration dependency not met: claim_similarity table not found. ` +
        `Please apply migration 001-vector-schema first.`
    );
  }
}

/**
 * Check if contradiction schema has already been applied.
 */
export async function isContradictionSchemaApplied(
  db: Surreal
): Promise<boolean> {
  try {
    // Check if contradiction_type field exists on claim_similarity
    const tableInfo = await db.query<[{ fd: Record<string, unknown> }]>(
      "INFO FOR TABLE claim_similarity"
    );

    if (!tableInfo[0]?.fd) {
      return false;
    }

    const fields = tableInfo[0].fd;
    return "contradiction_type" in fields && "explanation" in fields;
  } catch {
    return false;
  }
}

/**
 * Rollback the migration.
 */
export async function rollbackContradictionSchema(db: Surreal): Promise<void> {
  console.log("Rolling back contradiction schema migration...");

  try {
    // Remove fields added by this migration
    // Note: REMOVE FIELD syntax may vary by SurrealDB version
    await db.query(`
      REMOVE FIELD contradiction_type ON TABLE claim_similarity;
      REMOVE FIELD explanation ON TABLE claim_similarity;
    `);

    // Try to remove the index
    try {
      await db.query(`
        REMOVE INDEX idx_claim_similarity_contradicts ON TABLE claim_similarity;
      `);
    } catch {
      // Index may not exist or syntax may differ
      console.warn("Could not remove contradiction index (may not exist)");
    }

    console.log("Contradiction schema rolled back successfully");
  } catch (error) {
    console.error("Failed to rollback contradiction schema:", error);
    throw error;
  }
}

/**
 * Apply the contradiction schema migration.
 */
export async function migrateContradictionSchema(db: Surreal): Promise<void> {
  console.log(`Applying migration ${MIGRATION_VERSION}: ${MIGRATION_NAME}...`);

  // Check dependencies first
  await checkDependencies(db);

  // Check if already applied
  const alreadyApplied = await isContradictionSchemaApplied(db);
  if (alreadyApplied) {
    console.log("Contradiction schema already applied, skipping...");
    return;
  }

  try {
    await db.query(CONTRADICTION_SCHEMA);
    console.log("Contradiction schema applied successfully");
  } catch (error) {
    console.error("Failed to apply contradiction schema:", error);
    console.log("Attempting rollback...");
    try {
      await rollbackContradictionSchema(db);
    } catch (rollbackError) {
      console.error("Rollback also failed:", rollbackError);
    }
    throw error;
  }
}
