#!/usr/bin/env bun
import { program } from "commander";
import { runDigestWorkflow } from "../workflows/digest";
import { closeDb } from "../db";

function isValidDate(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return false;
  }
  // Validate it's a real date (handles cases like 2024-02-30)
  const [year, month, day] = dateStr.split("-").map(Number);
  return date.getFullYear() === year &&
         date.getMonth() === month - 1 &&
         date.getDate() === day;
}

function isFutureDate(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
}

// Graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\nReceived ${signal}, shutting down gracefully...`);
  try {
    await closeDb();
  } catch (error) {
    // Ignore errors during shutdown
  }
  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

program
  .name("digest")
  .description("Generate a daily news digest")
  .option("-d, --date <date>", "Date for the digest (YYYY-MM-DD)")
  .option("--from <date>", "Start date for range")
  .option("--to <date>", "End date for range")
  .action(async (options: { date?: string; from?: string; to?: string }) => {
    console.log("My Slow News - Digest Generator\n");
    console.log("================================\n");

    try {
      if (options.from && options.to) {
        // Validate date range
        if (!isValidDate(options.from)) {
          console.error(`Error: Invalid start date "${options.from}". Use YYYY-MM-DD format.`);
          process.exit(1);
        }
        if (!isValidDate(options.to)) {
          console.error(`Error: Invalid end date "${options.to}". Use YYYY-MM-DD format.`);
          process.exit(1);
        }

        // Generate digests for a date range
        const start = new Date(options.from);
        const end = new Date(options.to);

        if (start > end) {
          console.error("Error: Start date must be before or equal to end date.");
          process.exit(1);
        }

        for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
          const dateStr = d.toISOString().split("T")[0];
          console.log(`\n--- Generating digest for ${dateStr} ---\n`);
          await runDigestWorkflow(dateStr);
        }
      } else if (options.from || options.to) {
        console.error("Error: Both --from and --to are required for date range.");
        process.exit(1);
      } else {
        // Single date (today or specified)
        if (options.date && !isValidDate(options.date)) {
          console.error(`Error: Invalid date "${options.date}". Use YYYY-MM-DD format.`);
          process.exit(1);
        }

        const date = options.date || new Date().toISOString().split("T")[0];

        if (isFutureDate(date)) {
          console.warn(`Warning: ${date} is in the future. Reddit data may be incomplete.`);
        }
        console.log(`Generating digest for: ${date}\n`);
        const result = await runDigestWorkflow(date);

        console.log("\n================================");
        console.log("Digest generation complete!");
        console.log(`  Posts processed: ${(result as any)?.posts_processed || 0}`);
        console.log(`  Claims extracted: ${(result as any)?.claims_extracted || 0}`);
        console.log(`  File: ${(result as any)?.digest_path || "unknown"}`);
      }
    } catch (error) {
      console.error("Error generating digest:", error);
      process.exit(1);
    }
  });

program.parse();
