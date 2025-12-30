#!/usr/bin/env bun
import "../../env";
import React from "react";
import { render } from "ink";
import { Command } from "commander";
import { App } from "./App.js";
import { loadConfig } from "../../config/index.js";

const program = new Command();

program
  .name("query")
  .description("Interactive data explorer for your knowledge base")
  .option("-d, --days <days>", "Initial time filter in days", "30")
  .option("-s, --subject <subject>", "Pre-filter by subject")
  .option("-p, --predicate <predicate>", "Pre-filter by predicate")
  .option("--non-interactive", "Output results and exit (legacy mode)")
  .action(async (options) => {
    const config = loadConfig();
    const initialDays = parseInt(options.days, 10) || 30;

    // Legacy mode for backwards compatibility
    if (options.nonInteractive) {
      console.log("Legacy mode is deprecated. Use interactive explorer instead.");
      console.log("Run without --non-interactive for the new experience.");
      process.exit(0);
    }

    const { waitUntilExit } = render(
      <App
        config={config}
        initialDays={initialDays}
        initialSubject={options.subject}
        initialPredicate={options.predicate}
      />
    );

    await waitUntilExit();
  });

program.parse();
