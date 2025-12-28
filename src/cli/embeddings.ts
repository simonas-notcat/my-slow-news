#!/usr/bin/env bun
/**
 * CLI commands for managing claim embeddings.
 *
 * Usage:
 *   bun run embeddings backfill     - Generate embeddings for claims without them
 *   bun run embeddings detect       - Find duplicate claims
 *   bun run embeddings stats        - Show embedding statistics
 */

import { program } from "commander";
import { loadConfig } from "../config";
import { getDb, closeDb } from "../db";
import { getEmbeddingService, type EmbeddingConfig } from "../embeddings";
import {
  ClaimDeduplicationService,
  type DeduplicationConfig,
} from "../embeddings/deduplication";
import { formatClaimForEmbedding } from "../embeddings/claim-formatter";

/**
 * Convert config.embeddings (snake_case from YAML) to EmbeddingConfig (camelCase)
 */
function toEmbeddingConfig(config: {
  provider: "openai" | "ollama";
  model: string;
  dimensions: number;
  cache_enabled: boolean;
  cache_size: number;
  batch_size: number;
}): EmbeddingConfig {
  return {
    provider: config.provider,
    model: config.model,
    dimensions: config.dimensions,
    cacheEnabled: config.cache_enabled,
    cacheSize: config.cache_size,
    batchSize: config.batch_size,
  };
}

/**
 * Convert config.semantic.deduplication to DeduplicationConfig
 */
function toDeduplicationConfig(config: {
  enabled: boolean;
  similarity_threshold: number;
  related_threshold: number;
}): DeduplicationConfig {
  return {
    duplicateThreshold: config.similarity_threshold,
    relatedThreshold: config.related_threshold,
  };
}

program
  .name("embeddings")
  .description("Manage claim embeddings for semantic features");

program
  .command("backfill")
  .description("Generate embeddings for claims without them")
  .option("-b, --batch-size <size>", "Batch size for processing", "50")
  .option("-v, --verbose", "Show detailed progress")
  .action(async (options: { batchSize: string; verbose?: boolean }) => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const embeddingConfig = toEmbeddingConfig(config.embeddings);
      const deduplicationConfig = toDeduplicationConfig(
        config.semantic.deduplication,
      );

      console.log("My Slow News - Embedding Backfill\n");
      console.log(`Provider: ${embeddingConfig.provider}`);
      console.log(`Model: ${embeddingConfig.model}`);
      console.log(`Dimensions: ${embeddingConfig.dimensions}\n`);

      const embeddingService = getEmbeddingService(embeddingConfig);
      const deduper = new ClaimDeduplicationService(
        db,
        embeddingService,
        deduplicationConfig,
      );

      const startTime = Date.now();

      const { processed, errors } = await deduper.backfillEmbeddings({
        batchSize: parseInt(options.batchSize, 10),
        onProgress: (done, total) => {
          if (options.verbose) {
            process.stdout.write(`\rProgress: ${done}/${total} claims`);
          } else {
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            process.stdout.write(`\rProgress: ${pct}%`);
          }
        },
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log("\n");
      console.log(`Complete in ${elapsed}s`);
      console.log(`  Embedded: ${processed} claims`);
      if (errors > 0) {
        console.log(`  Errors: ${errors} claims`);
      }
    } catch (error) {
      console.error("\nError during backfill:", error);
      process.exit(1);
    } finally {
      await closeDb();
    }
  });

program
  .command("detect")
  .alias("detect-duplicates")
  .description("Find duplicate claims in existing data")
  .option(
    "-m, --max-claims <count>",
    "Maximum claims to process (default: 1000)",
    "1000",
  )
  .option("-v, --verbose", "Show detailed progress")
  .action(async (options: { maxClaims: string; verbose?: boolean }) => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const embeddingConfig = toEmbeddingConfig(config.embeddings);
      const deduplicationConfig = toDeduplicationConfig(
        config.semantic.deduplication,
      );

      console.log("My Slow News - Duplicate Detection\n");
      console.log(
        `Similarity threshold: ${(deduplicationConfig.duplicateThreshold * 100).toFixed(0)}%\n`,
      );

      const embeddingService = getEmbeddingService(embeddingConfig);
      const deduper = new ClaimDeduplicationService(
        db,
        embeddingService,
        deduplicationConfig,
      );

      const maxClaims = parseInt(options.maxClaims, 10);
      const startTime = Date.now();

      const { duplicatePairs, truncated } =
        await deduper.detectExistingDuplicates({
          maxClaims,
          onProgress: (checked, total) => {
            if (options.verbose) {
              process.stdout.write(
                `\rProgress: ${checked}/${total} pairs checked`,
              );
            } else {
              const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
              process.stdout.write(`\rScanning: ${pct}%`);
            }
          },
        });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log("\n");

      if (truncated) {
        console.log(
          `Note: Only processed first ${maxClaims} claims. Use --max-claims to increase.\n`,
        );
      }

      if (duplicatePairs.length === 0) {
        console.log(`No duplicates found (scanned in ${elapsed}s)`);
        return;
      }

      console.log(
        `Found ${duplicatePairs.length} duplicate pairs (in ${elapsed}s):\n`,
      );

      for (const pair of duplicatePairs) {
        const text1 = formatClaimForEmbedding(pair.claim1);
        const text2 = formatClaimForEmbedding(pair.claim2);

        console.log(`  "${text1}"`);
        console.log(`  ↔ "${text2}"`);
        console.log(`    Similarity: ${(pair.similarity * 100).toFixed(1)}%`);
        console.log(`    IDs: ${pair.claim1.id} ↔ ${pair.claim2.id}`);
        console.log();
      }
    } catch (error) {
      console.error("\nError during detection:", error);
      process.exit(1);
    } finally {
      await closeDb();
    }
  });

program
  .command("stats")
  .description("Show embedding statistics")
  .action(async () => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const embeddingConfig = toEmbeddingConfig(config.embeddings);
      const deduplicationConfig = toDeduplicationConfig(
        config.semantic.deduplication,
      );

      const embeddingService = getEmbeddingService(embeddingConfig);
      const deduper = new ClaimDeduplicationService(
        db,
        embeddingService,
        deduplicationConfig,
      );

      const stats = await deduper.getStats();

      console.log("My Slow News - Embedding Statistics\n");
      console.log("Configuration:");
      console.log(`  Provider: ${embeddingConfig.provider}`);
      console.log(`  Model: ${embeddingConfig.model}`);
      console.log(`  Dimensions: ${embeddingConfig.dimensions}`);
      console.log();
      console.log("Claims:");
      console.log(`  Total claims:     ${stats.total}`);
      const pct =
        stats.total > 0
          ? ((stats.withEmbedding / stats.total) * 100).toFixed(1)
          : "0";
      console.log(`  With embeddings:  ${stats.withEmbedding} (${pct}%)`);
      console.log(`  Canonical:        ${stats.canonical}`);
      console.log(`  Duplicates:       ${stats.duplicates}`);

      if (stats.total > 0 && stats.withEmbedding < stats.total) {
        console.log();
        console.log(
          `Tip: Run 'bun run embeddings backfill' to generate missing embeddings.`,
        );
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
      process.exit(1);
    } finally {
      await closeDb();
    }
  });

program
  .command("merge <duplicate-id> <canonical-id>")
  .description("Manually merge a duplicate claim into a canonical one")
  .option("--no-stances", "Don't merge stance data")
  .action(
    async (
      duplicateId: string,
      canonicalId: string,
      options: { stances: boolean },
    ) => {
      const config = loadConfig();
      const db = await getDb(config);

      try {
        const embeddingConfig = toEmbeddingConfig(config.embeddings);
        const deduplicationConfig = toDeduplicationConfig(
          config.semantic.deduplication,
        );

        const embeddingService = getEmbeddingService(embeddingConfig);
        const deduper = new ClaimDeduplicationService(
          db,
          embeddingService,
          deduplicationConfig,
        );

        console.log("Merging claims...\n");
        console.log(`  Duplicate: ${duplicateId}`);
        console.log(`  Canonical: ${canonicalId}`);
        console.log(`  Merge stances: ${options.stances ? "yes" : "no"}`);
        console.log();

        await deduper.mergeDuplicate(duplicateId, canonicalId, options.stances);

        console.log("Merge complete.");
      } catch (error) {
        console.error("Error merging claims:", error);
        process.exit(1);
      } finally {
        await closeDb();
      }
    },
  );

program.parse();
