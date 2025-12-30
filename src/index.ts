// My Slow News - Entry Point
// This file can be used for development/testing

import "./env";
import { loadConfig } from "./config";
import { mastra } from "./mastra";

console.log("My Slow News");
console.log("============");
console.log();

const config = loadConfig();

console.log("Configuration loaded:");
console.log(`  Subreddits: ${config.sources.reddit.subreddits.join(", ")}`);
console.log(`  Posts per subreddit: ${config.sources.reddit.posts_per_subreddit}`);
console.log(`  Lookback: ${config.sources.reddit.lookback_hours} hours`);
console.log(`  LLM Model: ${config.llm.model}`);
console.log(`  Daily budget: $${config.llm.daily_budget_usd}`);
console.log();

console.log("Available agents: summarizer, extractor");
console.log();

console.log("CLI Commands:");
console.log("  bun run digest         - Generate today's digest");
console.log("  bun run digest -d DATE - Generate digest for specific date");
console.log("  bun run stance         - Record your stance on a claim");
console.log("  bun run query themes   - Find recurring themes");
console.log("  bun run query claims   - Search the knowledge base");
console.log("  bun run predicates     - View predicate ontology");
console.log("  bun run db:init        - Initialize database schema");
