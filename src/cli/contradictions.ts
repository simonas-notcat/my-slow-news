#!/usr/bin/env bun
/**
 * CLI for detecting and managing contradicting claims.
 */

import { Command } from "commander";
import { loadConfig } from "../config";
import { getDb, closeDb } from "../db";
import {
  ContradictionDetectionService,
  createContradictionVerifier,
} from "../embeddings/contradictions";

const program = new Command();

program
  .name("contradictions")
  .description("Detect and manage contradicting claims");

/** Input validation constraints */
const CLI_LIMITS = {
  limit: { min: 1, max: 500, default: 50 },
  similarity: { min: 0.5, max: 1.0, default: 0.7 },
  maxClaims: { min: 10, max: 1000, default: 500 },
} as const;

/**
 * Validate and parse numeric option with bounds checking.
 */
function parseNumericOption(
  value: string,
  name: string,
  limits: { min: number; max: number; default: number }
): number {
  const parsed = parseFloat(value);

  if (isNaN(parsed)) {
    console.error(`Error: ${name} must be a valid number`);
    process.exit(1);
  }

  if (parsed < limits.min || parsed > limits.max) {
    console.error(
      `Error: ${name} must be between ${limits.min} and ${limits.max}`
    );
    process.exit(1);
  }

  return parsed;
}

program
  .command("detect")
  .description("Scan for contradicting claims")
  .option(
    "-l, --limit <count>",
    `Maximum contradictions to find (${CLI_LIMITS.limit.min}-${CLI_LIMITS.limit.max})`,
    String(CLI_LIMITS.limit.default)
  )
  .option(
    "-s, --similarity <threshold>",
    `Minimum similarity threshold (${CLI_LIMITS.similarity.min}-${CLI_LIMITS.similarity.max})`,
    String(CLI_LIMITS.similarity.default)
  )
  .option(
    "-m, --max-claims <count>",
    `Maximum claims to process (${CLI_LIMITS.maxClaims.min}-${CLI_LIMITS.maxClaims.max})`,
    String(CLI_LIMITS.maxClaims.default)
  )
  .option("--no-llm", "Skip LLM verification (faster but less accurate)")
  .option(
    "--optimized",
    "Use optimized vector-index-based detection (recommended for >500 claims)"
  )
  .option("--save", "Save detected contradictions to database")
  .action(async (options) => {
    // Validate inputs
    const limit = parseNumericOption(
      options.limit,
      "limit",
      CLI_LIMITS.limit
    );
    const similarity = parseNumericOption(
      options.similarity,
      "similarity",
      CLI_LIMITS.similarity
    );
    const maxClaims = parseNumericOption(
      options.maxClaims,
      "max-claims",
      CLI_LIMITS.maxClaims
    );

    const config = loadConfig();
    const db = await getDb(config);

    try {
      const llmVerify = options.llm ? createContradictionVerifier() : undefined;
      const service = new ContradictionDetectionService(db, llmVerify);

      console.log("Scanning for contradictions...");
      if (!options.llm) {
        console.log("  (LLM verification disabled - only structural detection)");
      }
      console.log();

      // Use optimized method for large datasets
      const detectFn = options.optimized
        ? service.detectContradictionsOptimized.bind(service)
        : service.detectContradictions.bind(service);

      const contradictions = await detectFn({
        limit,
        minSimilarity: similarity,
        useLlmVerification: options.llm,
        maxClaims,
      });

      if (contradictions.length === 0) {
        console.log("No contradictions found!");
        console.log(
          "This could mean your knowledge base is internally consistent,"
        );
        console.log("or the claims don't have enough semantic overlap.");
        return;
      }

      console.log(`Found ${contradictions.length} contradictions:\n`);

      for (const c of contradictions) {
        const typeIcon = getTypeIcon(c.contradictionType);
        console.log(
          `${typeIcon} [${c.contradictionType}] ${Math.round(c.confidence * 100)}% confident`
        );
        console.log(
          `  "${c.claim1.subject} ${c.claim1.predicate} ${c.claim1.object}"`
        );
        console.log(`  vs`);
        console.log(
          `  "${c.claim2.subject} ${c.claim2.predicate} ${c.claim2.object}"`
        );
        if (c.explanation) {
          console.log(`  Reason: ${c.explanation}`);
        }
        console.log();

        if (options.save) {
          await service.storeContradiction(c);
        }
      }

      if (options.save) {
        console.log(`Saved ${contradictions.length} contradictions to database.`);
      } else {
        console.log("Use --save to persist these contradictions.");
      }
    } finally {
      await closeDb();
    }
  });

program
  .command("stats")
  .description("Show contradiction statistics")
  .action(async () => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const service = new ContradictionDetectionService(db);
      const stats = await service.getStats();

      console.log("Contradiction Statistics");
      console.log("========================");
      console.log(`Total contradictions stored: ${stats.totalContradictions}`);
      console.log();

      if (stats.mostContestedSubjects.length > 0) {
        console.log("Most contested subjects:");
        for (const s of stats.mostContestedSubjects.slice(0, 5)) {
          console.log(`  ${s.subject}: ${s.count} contradictions`);
        }
        console.log();
      }

      if (stats.mostContestedPredicates.length > 0) {
        console.log("Most contested predicates:");
        for (const p of stats.mostContestedPredicates.slice(0, 5)) {
          console.log(`  ${p.predicate}: ${p.count} contradictions`);
        }
      }

      if (
        stats.totalContradictions === 0 &&
        stats.mostContestedSubjects.length === 0
      ) {
        console.log("No contradictions stored yet.");
        console.log("Run 'bun run contradictions detect --save' to find and store some.");
      }
    } finally {
      await closeDb();
    }
  });

program
  .command("list")
  .description("List stored contradictions")
  .option("-l, --limit <count>", "Number of contradictions to show", "20")
  .action(async (options) => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const service = new ContradictionDetectionService(db);
      const limit = parseInt(options.limit, 10) || 20;
      const contradictions = await service.getStoredContradictions({ limit });

      if (contradictions.length === 0) {
        console.log("No contradictions stored.");
        console.log("Run 'bun run contradictions detect --save' to find and store some.");
        return;
      }

      console.log(`Stored Contradictions (${contradictions.length}):\n`);

      for (const c of contradictions) {
        const typeIcon = getTypeIcon(c.contradictionType);
        console.log(
          `${typeIcon} [${c.contradictionType}] ${Math.round(c.confidence * 100)}%`
        );
        console.log(
          `  "${c.claim1.subject} ${c.claim1.predicate} ${c.claim1.object}"`
        );
        console.log(`  vs`);
        console.log(
          `  "${c.claim2.subject} ${c.claim2.predicate} ${c.claim2.object}"`
        );
        if (c.explanation) {
          console.log(`  Reason: ${c.explanation}`);
        }
        console.log();
      }
    } finally {
      await closeDb();
    }
  });

program
  .command("for <claimId>")
  .description("Find contradictions for a specific claim")
  .option("-l, --limit <count>", "Maximum contradictions", "10")
  .option("--no-llm", "Skip LLM verification")
  .action(async (claimId, options) => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const llmVerify = options.llm ? createContradictionVerifier() : undefined;
      const service = new ContradictionDetectionService(db, llmVerify);

      console.log(`Finding contradictions for ${claimId}...\n`);

      const contradictions = await service.findContradictionsFor(claimId, {
        limit: parseInt(options.limit, 10) || 10,
        useLlmVerification: options.llm,
      });

      if (contradictions.length === 0) {
        console.log("No contradictions found for this claim.");
        return;
      }

      console.log(`Found ${contradictions.length} contradictions:\n`);

      for (const c of contradictions) {
        const typeIcon = getTypeIcon(c.contradictionType);
        console.log(
          `${typeIcon} [${c.contradictionType}] ${Math.round(c.confidence * 100)}%`
        );
        console.log(
          `  Contradicts: ${c.claim2.subject} ${c.claim2.predicate} ${c.claim2.object}`
        );
        if (c.explanation) {
          console.log(`  Reason: ${c.explanation}`);
        }
        console.log();
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(`Error: ${error.message}`);
      } else {
        console.error("An error occurred:", error);
      }
      process.exit(1);
    } finally {
      await closeDb();
    }
  });

/**
 * Get icon for contradiction type.
 */
function getTypeIcon(type: string): string {
  switch (type) {
    case "direct":
      return "⚡";
    case "semantic":
      return "🔀";
    case "negation":
      return "¬";
    case "comparative":
      return "⇔";
    default:
      return "?";
  }
}

program.parse();
