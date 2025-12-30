import type Surreal from "surrealdb";

/**
 * Migration 003: Add theme clustering schema
 *
 * Adds:
 * - theme table for storing clustered themes
 * - claim_theme relation for linking claims to themes
 * - Vector index on theme centroids for similarity search
 */
export const THEME_SCHEMA = `
-- Theme table for storing clustered themes
DEFINE TABLE theme SCHEMAFULL;
DEFINE FIELD name ON theme TYPE string;
DEFINE FIELD description ON theme TYPE option<string>;
DEFINE FIELD keywords ON theme TYPE array<string>;
DEFINE FIELD centroid ON theme TYPE array<float>;
DEFINE FIELD claimCount ON theme TYPE int;
DEFINE FIELD createdAt ON theme TYPE datetime;
DEFINE FIELD updatedAt ON theme TYPE datetime;
DEFINE FIELD isActive ON theme TYPE bool DEFAULT true;

-- Index for active themes
DEFINE INDEX idx_theme_active ON theme FIELDS isActive;

-- Claim to theme relation
DEFINE TABLE claim_theme TYPE RELATION FROM claim TO theme SCHEMAFULL;
DEFINE FIELD membershipScore ON claim_theme TYPE float;
DEFINE FIELD assignedAt ON claim_theme TYPE datetime;

-- Index for finding claims in a theme
DEFINE INDEX idx_claim_theme_score ON claim_theme FIELDS membershipScore;
`;

/** Default embedding dimensions for vector index */
const DEFAULT_DIMENSIONS = 1536;

/**
 * Get vector index schema for theme centroids.
 */
export function getThemeVectorIndexSchema(dimensions: number): string {
  return `
-- Vector index for theme similarity search
DEFINE INDEX idx_theme_centroid ON theme FIELDS centroid
  VECTOR MTREE DIMENSION ${dimensions} DIST COSINE TYPE F32;
`;
}

/** Migration version for tracking */
export const MIGRATION_VERSION = "003";
export const MIGRATION_NAME = "theme-schema";

/** Dependencies: migrations that must be applied before this one */
export const MIGRATION_DEPENDENCIES = ["001-vector-schema"];

/**
 * Check if required dependencies are met.
 */
async function checkDependencies(db: Surreal): Promise<void> {
  try {
    // Check if claim table has embedding field (from vector schema)
    const claimInfo = await db.query<[{ fd?: Record<string, unknown> }]>(
      "INFO FOR TABLE claim"
    );

    // Skip dependency check if table info is not available
    // This happens when the table structure is different than expected
    if (!claimInfo[0]?.fd) {
      console.log("  Skipping dependency check (table info format not recognized)");
      return;
    }

    const fields = claimInfo[0].fd;
    const hasEmbedding = "embedding" in fields;

    if (!hasEmbedding) {
      throw new Error(
        `Migration dependency not met: claim.embedding field not found. ` +
          `Please apply migration 001-vector-schema first.`
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("dependency")) {
      throw error;
    }
    // Don't fail on dependency check errors - just log a warning
    console.log("  Warning: Could not verify dependencies, proceeding anyway");
  }
}

/**
 * Check if theme schema has already been applied.
 */
export async function isThemeSchemaApplied(db: Surreal): Promise<boolean> {
  try {
    // Check if theme table exists
    const tableResult = await db.query<[Record<string, unknown>]>(
      "INFO FOR TABLE theme"
    );
    const tableExists =
      tableResult[0] !== undefined && Object.keys(tableResult[0]).length > 0;

    if (!tableExists) {
      return false;
    }

    // Check if key fields exist
    const themeInfo = await db.query<[{ fd: Record<string, unknown> }]>(
      "INFO FOR TABLE theme"
    );

    if (!themeInfo[0]?.fd) {
      return false;
    }

    const fields = themeInfo[0].fd;
    return "name" in fields && "centroid" in fields && "isActive" in fields;
  } catch {
    return false;
  }
}

/**
 * Rollback the migration.
 */
export async function rollbackThemeSchema(db: Surreal): Promise<void> {
  console.log("Rolling back theme schema migration...");

  try {
    // Remove tables in reverse order of dependencies
    await db.query(`REMOVE TABLE claim_theme;`);
    await db.query(`REMOVE TABLE theme;`);

    console.log("Theme schema rolled back successfully");
  } catch (error) {
    console.error("Failed to rollback theme schema:", error);
    throw error;
  }
}

/**
 * Apply the theme schema migration.
 */
export async function migrateThemeSchema(
  db: Surreal,
  dimensions: number = DEFAULT_DIMENSIONS
): Promise<void> {
  console.log(`Applying migration ${MIGRATION_VERSION}: ${MIGRATION_NAME}...`);
  console.log(`  Using embedding dimensions: ${dimensions}`);

  // Check dependencies first
  await checkDependencies(db);

  // Check if already applied
  const alreadyApplied = await isThemeSchemaApplied(db);
  if (alreadyApplied) {
    console.log("Theme schema already applied, skipping...");
    return;
  }

  try {
    // Apply core theme schema
    // Split into individual statements and ignore "already exists" errors
    const statements = THEME_SCHEMA
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    for (const statement of statements) {
      try {
        await db.query(statement);
      } catch (error) {
        // Ignore "already exists" errors
        const message = error instanceof Error ? error.message : String(error);
        if (!message.includes("already exists")) {
          throw error;
        }
      }
    }
    console.log("  Theme table and relations applied");

    // Try to apply vector index (may fail on older SurrealDB versions)
    try {
      const vectorIndexSchema = getThemeVectorIndexSchema(dimensions);
      await db.query(vectorIndexSchema);
      console.log("  Theme vector index applied");
    } catch (indexError) {
      const message = indexError instanceof Error ? indexError.message : String(indexError);
      if (!message.includes("already exists")) {
        console.warn(
          "  Warning: Could not create theme vector index. Theme search will work but may be slower."
        );
        console.warn("  Error:", message);
      } else {
        console.log("  Theme vector index already exists");
      }
    }

    console.log("Theme schema migration completed successfully");
  } catch (error) {
    console.error("Failed to apply theme schema:", error);
    console.log("Attempting rollback...");
    try {
      await rollbackThemeSchema(db);
    } catch (rollbackError) {
      console.error("Rollback also failed:", rollbackError);
    }
    throw error;
  }
}
