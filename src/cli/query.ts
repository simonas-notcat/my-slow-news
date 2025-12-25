#!/usr/bin/env bun
import { program } from "commander";
import { loadConfig } from "../config";
import { getDb, closeDb } from "../db";
import type {
  PredicateCount,
  SubjectCount,
  ClaimRecord,
  ClaimWithStance,
} from "../types";

program
  .name("query")
  .description("Query the knowledge base");

program
  .command("themes <subreddit>")
  .description("Find recurring themes in a subreddit")
  .option("-d, --days <days>", "Number of days to analyze", "30")
  .action(async (subreddit, options) => {
    const days = parseInt(options.days, 10);
    if (isNaN(days) || days < 0) {
      console.error("Error: --days must be a positive number");
      process.exit(1);
    }
    console.log(`Finding themes in r/${subreddit} (last ${days} days)\n`);

    try {
      const config = loadConfig();
      const db = await getDb(config);

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      // Find most common predicates (themes)
      const [predicates] = await db.query<[PredicateCount[]]>(`
        SELECT predicate, count() as count
        FROM claim
        WHERE extracted_at >= $cutoff
        GROUP BY predicate
        ORDER BY count DESC
        LIMIT 10
      `, { cutoff: cutoff.toISOString() });

      console.log("Top Predicates (Actions/Relationships):");
      console.log("----------------------------------------");
      for (const p of predicates || []) {
        console.log(`  ${p.predicate}: ${p.count} claims`);
      }

      // Find most discussed subjects
      const [subjects] = await db.query<[SubjectCount[]]>(`
        SELECT subject, count() as count
        FROM claim
        WHERE extracted_at >= $cutoff
        GROUP BY subject
        ORDER BY count DESC
        LIMIT 10
      `, { cutoff: cutoff.toISOString() });

      console.log("\nTop Subjects (Entities):");
      console.log("------------------------");
      for (const s of subjects || []) {
        console.log(`  ${s.subject}: ${s.count} claims`);
      }

      await closeDb();
    } catch (error) {
      console.error("Error querying themes:", error);
      process.exit(1);
    }
  });

program
  .command("claims")
  .description("Search claims in the knowledge base")
  .option("-s, --subject <subject>", "Filter by subject")
  .option("-p, --predicate <predicate>", "Filter by predicate")
  .option("-o, --object <object>", "Filter by object")
  .option("-d, --days <days>", "Number of days to search", "7")
  .action(async (options) => {
    const days = parseInt(options.days, 10);
    if (isNaN(days) || days < 0) {
      console.error("Error: --days must be a positive number");
      process.exit(1);
    }
    console.log("Searching claims...\n");

    try {
      const config = loadConfig();
      const db = await getDb(config);

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      let query = `
        SELECT *
        FROM claim
        WHERE extracted_at >= $cutoff
      `;
      const params: Record<string, string> = { cutoff: cutoff.toISOString() };

      if (options.subject) {
        query += ` AND subject CONTAINS $subject`;
        params.subject = options.subject;
      }
      if (options.predicate) {
        query += ` AND predicate = $predicate`;
        params.predicate = options.predicate;
      }
      if (options.object) {
        query += ` AND object CONTAINS $object`;
        params.object = options.object;
      }

      query += ` ORDER BY extracted_at DESC LIMIT 20`;

      const [claims] = await db.query<[ClaimRecord[]]>(query, params);

      console.log("Claims Found:");
      console.log("-------------");
      for (const claim of claims || []) {
        console.log(`  (${claim.subject}, ${claim.predicate}, ${claim.object})`);
        console.log(`    Confidence: ${Math.round(claim.confidence * 100)}%`);
        console.log(`    Extracted: ${claim.extracted_at}`);
        console.log();
      }

      if (!claims?.length) {
        console.log("  No claims found matching criteria.");
      }

      await closeDb();
    } catch (error) {
      console.error("Error searching claims:", error);
      process.exit(1);
    }
  });

program
  .command("my-stances")
  .description("List all claims where you have recorded a stance")
  .action(async () => {
    console.log("Your Stances:\n");

    try {
      const config = loadConfig();
      const db = await getDb(config);

      const [stances] = await db.query<[ClaimWithStance[]]>(`
        SELECT claim.subject, claim.predicate, claim.object, user_stance, user_note
        FROM claim_stances
        WHERE user_stance != NONE
        FETCH claim
      `);

      for (const s of stances || []) {
        const claim = s.claim;
        if (claim) {
          console.log(`(${claim.subject}, ${claim.predicate}, ${claim.object})`);
          console.log(`  Your stance: ${s.user_stance}`);
          if (s.user_note) {
            console.log(`  Note: ${s.user_note}`);
          }
          console.log();
        }
      }

      if (!stances?.length) {
        console.log("You haven't recorded any stances yet.");
        console.log('Use: bun run stance "Subject predicate Object" agree|disagree');
      }

      await closeDb();
    } catch (error) {
      console.error("Error fetching stances:", error);
      process.exit(1);
    }
  });

program.parse();
