#!/usr/bin/env bun
import { program } from "commander";
import { runDigestWorkflow } from "../workflows/digest";

program
  .name("digest")
  .description("Generate a daily news digest")
  .option("-d, --date <date>", "Date for the digest (YYYY-MM-DD)")
  .option("--from <date>", "Start date for range")
  .option("--to <date>", "End date for range")
  .action(async (options) => {
    console.log("My Slow News - Digest Generator\n");
    console.log("================================\n");

    try {
      if (options.from && options.to) {
        // Generate digests for a date range
        const start = new Date(options.from);
        const end = new Date(options.to);

        for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split("T")[0];
          console.log(`\n--- Generating digest for ${dateStr} ---\n`);
          await runDigestWorkflow(dateStr);
        }
      } else {
        // Single date (today or specified)
        const date = options.date || new Date().toISOString().split("T")[0];
        console.log(`Generating digest for: ${date}\n`);
        const result = await runDigestWorkflow(date);

        console.log("\n================================");
        console.log("Digest generation complete!");
        console.log(`  Posts processed: ${result.output?.posts_processed || 0}`);
        console.log(`  Claims extracted: ${result.output?.claims_extracted || 0}`);
        console.log(`  File: ${result.output?.digest_path || "unknown"}`);
      }
    } catch (error) {
      console.error("Error generating digest:", error);
      process.exit(1);
    }
  });

program.parse();
