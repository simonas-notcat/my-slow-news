#!/usr/bin/env node
import "../env";
import { validateEnv } from "../config/env";
import { program } from "commander";
import { loadConfig } from "../config";
import { getDb, closeDb } from "../db";

// Validate environment variables before proceeding
validateEnv();

program
  .name("predicates")
  .description("Manage the predicate ontology")
  .option("--new", "Show only new predicates (not built-in)")
  .option("--all", "Show all predicates with usage counts")
  .action(async (options: { new?: boolean; all?: boolean }) => {
    console.log("My Slow News - Predicate Registry\n");

    const config = loadConfig();
    const db = await getDb(config);

    try {
      if (options.new) {
        // Show only new predicates
        const predicates = await db.query<any[][]>(`
          SELECT name, description, first_seen, usage_count
          FROM predicate
          WHERE is_builtin = false
          ORDER BY first_seen DESC
        `);

        console.log("New Predicates (LLM-generated):");
        console.log("-------------------------------");
        for (const p of predicates[0] || []) {
          console.log(`  ${p.name}`);
          if (p.description) {
            console.log(`    Description: ${p.description}`);
          }
          console.log(`    First seen: ${p.first_seen}`);
          console.log(`    Usage count: ${p.usage_count}`);
          console.log();
        }

        if (!predicates[0]?.length) {
          console.log("  No new predicates have been generated yet.");
        }
      } else {
        // Show all predicates
        const predicates = await db.query<any[][]>(`
          SELECT name, description, is_builtin, usage_count
          FROM predicate
          ORDER BY usage_count DESC
        `);

        console.log("All Predicates:");
        console.log("---------------");

        // Group by built-in vs new
        const builtIn = (predicates[0] || []).filter((p: { is_builtin: boolean }) => p.is_builtin);
        const custom = (predicates[0] || []).filter((p: { is_builtin: boolean }) => !p.is_builtin);

        console.log("\nBuilt-in:");
        for (const p of builtIn) {
          console.log(`  ${p.name} (${p.usage_count} uses)`);
        }

        if (custom.length > 0) {
          console.log("\nCustom (LLM-generated):");
          for (const p of custom) {
            console.log(`  ${p.name} (${p.usage_count} uses)`);
          }
        }
      }
    } catch (error) {
      console.error("Error fetching predicates:", error);
      process.exit(1);
    } finally {
      await closeDb();
    }
  });

program.parse();
