# CLAUDE.md - My Slow News

This file provides guidance for AI assistants working with this codebase.

## Project Overview

**My Slow News** is a deliberate news consumption tool that generates daily digests from Reddit with AI-powered knowledge extraction. Instead of real-time news feeds, it provides thoughtful daily summaries with extracted claims stored as a knowledge graph.

### Core Concept
- Fetch top posts from configured subreddits
- Summarize content using Claude AI
- Extract factual claims as RDF-style triples (subject, predicate, object)
- Track user stances on claims over time
- Build a personal knowledge base

## Tech Stack

- **Runtime**: Node.js 20 LTS with tsx
- **Test Framework**: Vitest
- **AI Framework**: Mastra (`@mastra/core`)
- **LLM**: Anthropic Claude (anthropic/claude-sonnet-4-20250514)
- **Database**: SurrealDB (graph database)
- **CLI**: Commander.js
- **Interactive CLI**: Ink (React for CLI) with ink-select-input, ink-text-input, ink-spinner
- **Validation**: Zod
- **Config**: YAML

## Project Structure

```
src/
├── index.ts           # Development entry point
├── mastra.ts          # Mastra AI framework setup
├── agents/            # AI agent definitions
│   ├── index.ts       # Agent exports (summarizer, extractor)
│   └── tools/         # Agent tools
│       ├── extract-claims.ts   # Claim extraction tool
│       └── summarize.ts        # Digest save tool
├── cli/               # CLI commands
│   ├── digest.ts      # Generate daily digest
│   ├── query.ts       # Query knowledge base (legacy)
│   ├── stance.ts      # Record user stances
│   ├── predicates.ts  # View predicate ontology
│   └── explorer/      # Interactive CLI data explorer (Ink-based)
│       ├── index.tsx      # Entry point
│       ├── App.tsx        # Root component
│       ├── components/    # UI components (Header, Footer, ClaimsList, etc.)
│       ├── screens/       # Full-screen views (ClaimsListScreen, ClaimDetailScreen, FilterScreen)
│       ├── context/       # React context (AppContext, DatabaseContext)
│       ├── hooks/         # Custom hooks (useClaims, useKeyboard, useClaimDetail)
│       ├── utils/         # Query builders, formatters, stance operations
│       └── types.ts       # Explorer-specific types
├── config/            # Configuration loading
│   └── index.ts       # YAML config parser
├── db/                # Database layer
│   ├── index.ts       # SurrealDB connection
│   ├── schema.ts      # Table definitions
│   └── init.ts        # Schema initialization
├── sources/
│   ├── reddit/        # Reddit scraper (RSS + web scraping)
│   │   ├── index.ts       # High-level fetch functions
│   │   ├── client.ts      # Main Reddit client
│   │   ├── rss-fetcher.ts # RSS feed parser
│   │   └── scraper.ts     # Web scraping logic
│   ├── utils/         # Source utilities
│   │   ├── rate-limiter.ts    # Request rate limiting
│   │   └── user-agent-pool.ts # User agent rotation
│   └── types.ts       # Source-specific types
├── types/             # TypeScript type definitions
│   └── index.ts       # All types and Zod schemas
├── utils/             # Shared utilities
│   ├── budget-tracker.ts        # LLM usage tracking
│   ├── comment-selector.ts      # Diverse comment selection
│   ├── controversy-detector.ts  # Controversy scoring
│   ├── cot-summarizer.ts        # Chain-of-thought summarization
│   ├── hierarchical-summarizer.ts # Thread-aware summarization
│   ├── link-fetcher.ts          # External link content fetching
│   ├── parse-llm-json.ts        # JSON extraction from LLM output
│   ├── retry.ts                 # Retry with backoff utility
│   ├── theme-synthesizer.ts     # Cross-post theme synthesis
│   └── thread-builder.ts        # Comment thread reconstruction
└── workflows/         # Mastra workflows
    └── digest.ts      # Multi-step digest generation
```

## Development Commands

```bash
# Install dependencies
npm install

# Initialize database schema
npm run db:init

# Generate today's digest
npm run digest

# Generate digest for specific date
npm run digest -- -d 2025-01-15

# Generate digest for date range
npm run digest -- --from 2025-01-01 --to 2025-01-07

# Record your stance on a claim
npm run stance -- "Rust is-safer-than C++" agree -n "Memory safety by default"

# Interactive data explorer (new - replaces query subcommands)
npm run query                    # Launch interactive explorer
npm run query -- -d 7            # Start with 7-day filter
npm run query -- -s Rust         # Pre-filter by subject
npm run query -- -p is-better-than  # Pre-filter by predicate

# Legacy query commands (deprecated, use interactive explorer instead)
npm run query:legacy -- claims -s "Rust" -d 30
npm run query:legacy -- themes programming -d 30
npm run query:legacy -- my-stances

# View predicate ontology
npm run predicates -- --all

# Development mode with watch
npm run dev
```

## Environment Variables

Required in `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

No Reddit API credentials needed - the app uses RSS feeds and web scraping.

## Configuration (config.yaml)

```yaml
sources:
  reddit:
    subreddits: [programming, rust, typescript]
    posts_per_subreddit: 5
    lookback_hours: 24
    min_relative_score: 1.0  # Filter by average score multiplier
    max_comments_per_post: 50
    use_old_reddit: true     # Prefer old.reddit.com for scraping
    scraping_delay_ms: 500   # Minimum delay between requests

llm:
  provider: anthropic
  model: anthropic/claude-sonnet-4-20250514
  daily_budget_usd: 5.0

output:
  digest_dir: ./digests
  format: markdown

database:
  url: ws://localhost:8000/rpc
  namespace: myslownews
  database: main

# Summarization feature flags
summarization:
  comment_selection:
    top_scored_weight: 0.4
    replied_to_weight: 0.2
    controversial_weight: 0.2
    contrarian_weight: 0.2
  hierarchical:
    enabled: true
    min_comments_threshold: 20
    max_threads: 5
  controversy:
    enabled: true
    use_cot: true
    threshold: 0.5
  theme_synthesis:
    enabled: true
    min_posts: 3

# Link fetching for external content
link_fetching:
  enabled: true
  timeout_ms: 10000
  max_content_length: 5000
  allowed_domains: []
  blocked_domains: [twitter.com, x.com, facebook.com, instagram.com, tiktok.com]

# Semantic features configuration
semantic:
  deduplication:
    enabled: true
    similarity_threshold: 0.92
    related_threshold: 0.75
  related_in_digest:
    enabled: true              # Show related historical claims in digest
    per_claim_limit: 2          # Max related claims per new claim
    min_similarity: 0.65        # Minimum similarity threshold
  contradictions:
    enabled: true              # Detect contradicting claims
    min_similarity: 0.7         # Min similarity for contradiction check
    use_llm_verification: true  # Use LLM to verify semantic contradictions
    max_in_digest: 5            # Max contradictions to show in digest
```

## Database Schema

SurrealDB tables:

| Table | Purpose |
|-------|---------|
| `post` | Raw Reddit posts |
| `comment` | Reddit comments linked to posts |
| `claim` | Extracted RDF triples (subject, predicate, object) |
| `claim_stances` | User stances and community sentiment on claims |
| `digest` | Generated digest metadata |
| `predicate` | Predicate registry (built-in + LLM-generated) |
| `makes_claim` | Graph edge: content → claim relation |

### Built-in Predicates
- `announced`, `released`, `deprecated`
- `is-better-than`, `is-faster-than`, `is-safer-than`
- `acquired`, `supports`, `opposes`
- `uses`, `migrated-to`, `has`, `lacks`, `claims`

## AI Agents

### Summarizer Agent (`src/agents/index.ts:5-31`)
- Summarizes Reddit posts and comments
- Identifies notable comments and key topics
- Returns structured JSON with summary, sentiment, topics

### Extractor Agent (`src/agents/index.ts:33-87`)
- Extracts factual claims as RDF triples
- Determines source author stance (agrees/disagrees/neutral/uncertain)
- Analyzes community opinion from comments
- Uses kebab-case predicates (e.g., `is-better-than`)

## Workflow Pipeline (`src/workflows/digest.ts`)

The digest workflow has 5 sequential steps:

1. **fetch-content**: Fetch Reddit posts and comments via OAuth
2. **summarize-posts**: Run summarizer agent on each post
3. **extract-claims**: Run extractor agent to build triples
4. **generate-digest**: Create markdown file from summaries
5. **save-to-database**: Persist to SurrealDB (placeholder)

## Code Conventions

### TypeScript
- Strict mode enabled
- ES2022 target with ESNext modules
- Use Zod for runtime validation
- Export types from `src/types/index.ts`

### Imports
- Use relative imports within `src/`
- Always import types with `type` keyword when possible

### Error Handling
- CLI commands catch errors and call `process.exit(1)`
- Workflows log errors but continue processing other items
- Database operations use try/catch with specific error messages

### Naming
- Files: kebab-case (`extract-claims.ts`)
- Functions: camelCase (`fetchTopPostsWithComments`)
- Types/Interfaces: PascalCase (`PostRecord`)
- Predicates: kebab-case (`is-faster-than`)
- Database tables: lowercase (`claim_stances`)

### Agent Responses
- Agents return JSON embedded in text
- Parse with regex: `text.match(/\{[\s\S]*\}/)`
- Always provide fallback for parsing failures

## Docker Setup

```bash
# Start SurrealDB and app
docker-compose up -d

# Just the database
docker-compose up surrealdb -d

# Scheduled daily digest (runs at 7 AM)
docker-compose up cron -d
```

The cron service runs `npm run digest` daily at 07:00.

## Testing

Tests use Vitest. Run with `npm test` or `npm run test:ci` for CI mode.

### Test File Locations
- Tests are co-located with source files using `.test.ts` suffix
- Example: `src/utils/retry.ts` → `src/utils/retry.test.ts`

### Writing Tests for Vitest

```typescript
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

describe("my tests", () => {
  test("does something", () => {
    const mockFn = vi.fn(() => "value");
    expect(mockFn()).toBe("value");
  });
});
```

### Mocking Fetch

Mock `globalThis.fetch` for HTTP tests:

```typescript
import { describe, test, vi, beforeEach, afterEach } from "vitest";

const originalFetch = globalThis.fetch;

describe("my tests", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn(() => Promise.resolve(new Response("{}")));
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("fetches data", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ data: "test" })))
    );
    // ... test code
  });
});
```

### Test Patterns

- **Reset state between tests**: Use `beforeEach` to reset module state (e.g., `resetUsageTracker()`, `clearCachedToken()`)
- **Mock external dependencies**: Never make real API calls in tests
- **Type assertions for mock calls**: Use `as [string, RequestInit]` for mock call arguments
- **Mock fetch type assertion**: Use `as unknown as typeof fetch`
- **Test error cases**: Always test error handling paths
- **Clear cached state**: Modules with global state (like token caching) need reset functions for testing

### Existing Test Coverage

| Module | Test File |
|--------|-----------|
| `src/agents/tools/extract-claims.ts` | `src/agents/tools/extract-claims.test.ts` |
| `src/config/index.ts` | `src/config/config.test.ts` |
| `src/sources/reddit/client.ts` | `src/sources/reddit/client.test.ts` |
| `src/sources/reddit/rss-fetcher.ts` | `src/sources/reddit/rss-fetcher.test.ts` |
| `src/sources/reddit/scraper.ts` | `src/sources/reddit/scraper.test.ts` |
| `src/sources/utils/rate-limiter.ts` | `src/sources/utils/rate-limiter.test.ts` |
| `src/types/index.ts` | `src/types/types.test.ts` |
| `src/utils/budget-tracker.ts` | `src/utils/budget-tracker.test.ts` |
| `src/utils/comment-selector.ts` | `src/utils/comment-selector.test.ts` |
| `src/utils/controversy-detector.ts` | `src/utils/controversy-detector.test.ts` |
| `src/utils/cot-summarizer.ts` | `src/utils/cot-summarizer.test.ts` |
| `src/utils/hierarchical-summarizer.ts` | `src/utils/hierarchical-summarizer.test.ts` |
| `src/utils/link-fetcher.ts` | `src/utils/link-fetcher.test.ts` |
| `src/utils/parse-llm-json.ts` | `src/utils/parse-llm-json.test.ts` |
| `src/utils/retry.ts` | `src/utils/retry.test.ts` |
| `src/utils/theme-synthesizer.ts` | `src/utils/theme-synthesizer.test.ts` |
| `src/utils/thread-builder.ts` | `src/utils/thread-builder.test.ts` |
| `src/cli/explorer/utils/queries.ts` | `src/cli/explorer/utils/queries.test.ts` |
| `src/cli/explorer/utils/formatters.ts` | `src/cli/explorer/utils/formatters.test.ts` |
| `src/cli/explorer/utils/stanceOperations.ts` | `src/cli/explorer/utils/stanceOperations.test.ts` |

## Common Tasks

### Adding a New Subreddit
Edit `config.yaml` and add to `sources.reddit.subreddits` array.

### Adding a New Predicate
Built-in predicates are in `src/db/schema.ts` (SEED_PREDICATES). The extractor agent can generate new predicates dynamically, which are stored with `is_builtin: false`.

### Extending the Workflow
Add new steps in `src/workflows/digest.ts` using `createStep()`. Chain with `.then()` before `.commit()`.

### Adding a New CLI Command
1. Create file in `src/cli/`
2. Use Commander.js pattern from existing commands
3. Add script to `package.json`

## Database Connection

```typescript
import { loadConfig } from "./config";
import { getDb, closeDb } from "./db";

const config = loadConfig();
const db = await getDb(config);

// Use db.query() for SurrealQL queries
const results = await db.query<any[][]>(`SELECT * FROM claim LIMIT 10`);

await closeDb();
```

## Important Notes

- Reddit API rate limits: Small delays (100ms) between requests
- Token caching: Reddit OAuth tokens cached with expiration tracking
- Database singleton: `getDb()` returns cached connection
- Digests saved to `./digests/{YYYY-MM-DD}.md`
- Claims require ≥0.5 confidence to be stored
