import { loadConfig } from "../config";
import { getDb, closeDb } from "./index";
import { SCHEMA, SEED_PREDICATES } from "./schema";
import {
  migrateVectorSchema,
  isVectorSchemaApplied,
} from "./migrations/001-vector-schema";

async function initializeDatabase() {
  console.log("Initializing My Slow News database...");

  const config = loadConfig();
  const db = await getDb(config);

  console.log("Connected to SurrealDB");
  console.log(`  Namespace: ${config.database.namespace}`);
  console.log(`  Database: ${config.database.database}`);

  console.log("\nApplying schema...");

  // Split schema into individual statements and execute
  const statements = SCHEMA
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
        console.error(`Error executing: ${statement.substring(0, 50)}...`);
        console.error(error);
      }
    }
  }

  console.log("Schema applied successfully");

  console.log("\nSeeding built-in predicates...");
  try {
    await db.query(SEED_PREDICATES);
    console.log("Predicates seeded successfully");
  } catch (error) {
    console.error("Error seeding predicates:", error);
  }

  // Apply vector schema migration for semantic features
  console.log("\nChecking vector schema migration...");
  const vectorSchemaApplied = await isVectorSchemaApplied(db);
  if (vectorSchemaApplied) {
    console.log("Vector schema already applied, skipping migration");
  } else {
    await migrateVectorSchema(db);
  }

  // Verify tables exist
  console.log("\nVerifying tables...");
  const tables = [
    "post",
    "comment",
    "claim",
    "claim_stances",
    "digest",
    "predicate",
    "claim_similarity",
  ];
  for (const table of tables) {
    const result = await db.query(`INFO FOR TABLE ${table}`);
    console.log(`  ✓ ${table}`);
  }

  await closeDb();
  console.log("\nDatabase initialization complete!");
}

initializeDatabase().catch((error) => {
  console.error("Failed to initialize database:", error);
  process.exit(1);
});
