#!/usr/bin/env bun
/**
 * CLI for managing theme clustering of claims.
 */

import "../env";
import { Command } from "commander";
import { loadConfig } from "../config";
import { getDb, closeDb } from "../db";
import {
  ThemeClusteringService,
  createDefaultLabeler,
  type ClusteringAlgorithm,
} from "../embeddings/clustering";
import type { Config } from "../types";
import type Surreal from "surrealdb";

const program = new Command();

program.name("themes").description("Manage theme clustering");

/** Input validation constraints */
const CLI_LIMITS = {
  clusters: { min: 2, max: 100, default: 10 },
  epsilon: { min: 0.1, max: 1.0, default: 0.3 },
  minPoints: { min: 2, max: 50, default: 3 },
  limit: { min: 1, max: 100, default: 20 },
} as const;

/** Valid clustering algorithms */
const VALID_ALGORITHMS = ["kmeans", "dbscan", "hierarchical"] as const;

/**
 * Initialize config and database with proper error handling.
 */
async function initializeDbConnection(): Promise<{
  config: Config;
  db: Surreal;
}> {
  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(
      "Error loading config:",
      error instanceof Error ? error.message : error
    );
    console.error("Make sure config.yaml exists and is valid.");
    process.exit(1);
  }

  let db: Surreal;
  try {
    db = await getDb(config);
  } catch (error) {
    console.error(
      "Error connecting to database:",
      error instanceof Error ? error.message : error
    );
    console.error(`Check that SurrealDB is running at ${config.database.url}`);
    process.exit(1);
  }

  return { config, db };
}

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

/**
 * Validate algorithm option.
 */
function validateAlgorithm(algo: string): ClusteringAlgorithm {
  if (!VALID_ALGORITHMS.includes(algo as ClusteringAlgorithm)) {
    console.error(
      `Error: algorithm must be one of: ${VALID_ALGORITHMS.join(", ")}`
    );
    process.exit(1);
  }
  return algo as ClusteringAlgorithm;
}

program
  .command("cluster")
  .description("Run clustering on claims to generate themes")
  .option(
    "-a, --algorithm <algo>",
    `Clustering algorithm (${VALID_ALGORITHMS.join(", ")})`,
    "kmeans"
  )
  .option(
    "-k, --clusters <count>",
    `Number of clusters for kmeans (${CLI_LIMITS.clusters.min}-${CLI_LIMITS.clusters.max})`,
    "10"
  )
  .option(
    "-e, --epsilon <value>",
    `Epsilon for DBSCAN (${CLI_LIMITS.epsilon.min}-${CLI_LIMITS.epsilon.max})`,
    "0.3"
  )
  .option(
    "-m, --min-points <count>",
    `Minimum points per cluster (${CLI_LIMITS.minPoints.min}-${CLI_LIMITS.minPoints.max})`,
    "3"
  )
  .option("--save", "Save results to database")
  .option("--llm", "Use LLM to generate descriptive theme labels")
  .action(async (options) => {
    // Validate inputs
    const algorithm = validateAlgorithm(options.algorithm);
    const numClusters = parseNumericOption(
      options.clusters,
      "clusters",
      CLI_LIMITS.clusters
    );
    const epsilon = parseNumericOption(
      options.epsilon,
      "epsilon",
      CLI_LIMITS.epsilon
    );
    const minPoints = parseNumericOption(
      options.minPoints,
      "min-points",
      CLI_LIMITS.minPoints
    );

    const { db } = await initializeDbConnection();

    try {
      // Create service with optional LLM labeler
      const labeler = options.llm ? createDefaultLabeler() : undefined;
      const service = new ThemeClusteringService(db, labeler);

      console.log(`Running ${algorithm} clustering...`);
      if (options.llm) {
        console.log("  (Using LLM for theme labels)");
      }
      console.log();

      const result = await service.clusterClaims({
        algorithm,
        numClusters,
        epsilon,
        minPoints,
        minClusterSize: minPoints,
      });

      console.log("Clustering Results");
      console.log("==================");
      console.log(`Total claims: ${result.stats.totalClaims}`);
      console.log(`Clustered: ${result.stats.clusteredClaims}`);
      console.log(`Themes: ${result.stats.numThemes}`);
      console.log(`Avg cluster size: ${result.stats.avgClusterSize.toFixed(1)}`);
      if (result.stats.silhouetteScore !== undefined) {
        console.log(
          `Silhouette score: ${result.stats.silhouetteScore.toFixed(3)}`
        );
      }
      console.log(`Time: ${result.stats.executionTimeMs}ms`);
      console.log();

      if (result.themes.length > 0) {
        console.log("Themes:");
        for (const theme of result.themes) {
          console.log(`  * ${theme.name} (${theme.claimCount} claims)`);
          if (theme.description) {
            console.log(`    ${theme.description}`);
          }
          if (theme.keywords.length > 0) {
            console.log(`    Keywords: ${theme.keywords.join(", ")}`);
          }
        }
        console.log();
      }

      if (result.unclustered.length > 0) {
        console.log(
          `${result.unclustered.length} claims not assigned to any theme.`
        );
      }

      if (options.save) {
        console.log("\nSaving to database...");
        await service.saveClusteringResults(result);
        console.log("Done!");
      } else {
        console.log("\nUse --save to persist these themes.");
      }
    } finally {
      await closeDb();
    }
  });

program
  .command("list")
  .description("List all active themes")
  .action(async () => {
    const { db } = await initializeDbConnection();

    try {
      const service = new ThemeClusteringService(db);
      const themes = await service.getThemes();

      if (themes.length === 0) {
        console.log('No themes found. Run "bun run themes cluster --save" first.');
        return;
      }

      console.log("Active Themes");
      console.log("=============");
      for (const theme of themes) {
        console.log(`\n${theme.name} (${theme.claimCount} claims)`);
        if (theme.description) {
          console.log(`  ${theme.description}`);
        }
        console.log(`  Keywords: ${theme.keywords.join(", ")}`);
      }
    } finally {
      await closeDb();
    }
  });

program
  .command("show <themeId>")
  .description("Show details of a specific theme")
  .option("-l, --limit <count>", "Number of claims to show", "20")
  .action(async (themeId, options) => {
    const limit = parseNumericOption(options.limit, "limit", CLI_LIMITS.limit);
    const { db } = await initializeDbConnection();

    try {
      const service = new ThemeClusteringService(db);
      const theme = await service.getThemeWithClaims(themeId, { limit });

      if (!theme) {
        console.log("Theme not found.");
        return;
      }

      console.log(theme.name);
      console.log("=".repeat(theme.name.length));
      if (theme.description) {
        console.log(theme.description);
      }
      console.log(`Keywords: ${theme.keywords.join(", ")}`);
      console.log(`Total claims: ${theme.claimCount}`);
      console.log();

      console.log("Claims:");
      for (const claim of theme.claims) {
        const score = Math.round(claim.membershipScore * 100);
        console.log(
          `  [${score}%] ${claim.subject} ${claim.predicate} ${claim.object}`
        );
      }
    } finally {
      await closeDb();
    }
  });

program
  .command("for-claim <claimId>")
  .description("Find which theme a claim belongs to")
  .action(async (claimId) => {
    const { db } = await initializeDbConnection();

    try {
      const service = new ThemeClusteringService(db);
      const theme = await service.getClaimTheme(claimId);

      if (!theme) {
        console.log("This claim is not assigned to any theme.");
        return;
      }

      console.log(`Theme: ${theme.name}`);
      if (theme.description) {
        console.log(`Description: ${theme.description}`);
      }
      console.log(`Keywords: ${theme.keywords.join(", ")}`);
    } finally {
      await closeDb();
    }
  });

program
  .command("stats")
  .description("Show theme statistics")
  .action(async () => {
    const { db } = await initializeDbConnection();

    try {
      const service = new ThemeClusteringService(db);
      const stats = await service.getStats();

      console.log("Theme Statistics");
      console.log("================");
      console.log(`Total themes: ${stats.totalThemes}`);
      console.log(`Total clustered claims: ${stats.totalClustered}`);
      console.log(`Avg cluster size: ${stats.avgClusterSize.toFixed(1)}`);

      if (stats.largestTheme) {
        console.log(
          `Largest theme: ${stats.largestTheme.name} (${stats.largestTheme.count} claims)`
        );
      }

      if (stats.totalThemes === 0) {
        console.log(
          '\nNo themes stored yet. Run "bun run themes cluster --save" to create some.'
        );
      }
    } finally {
      await closeDb();
    }
  });

program.parse();
