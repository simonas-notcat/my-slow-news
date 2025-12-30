# My Slow News

A deliberate news consumption tool that generates daily digests from Reddit with AI-powered knowledge extraction.

Instead of consuming news in real-time, My Slow News creates thoughtful daily summaries and extracts factual claims into a personal knowledge graph. Track your stances on claims over time and build a structured understanding of the information you consume.

## Features

- **Daily Digests**: Automated summaries of top Reddit posts from your configured subreddits
- **Knowledge Extraction**: AI extracts factual claims as RDF-style triples (subject, predicate, object)
- **Interactive Explorer**: Terminal-based UI with vim-style navigation, filtering, and inline stance recording
- **Web Explorer**: Browser-based UI for exploring claims (deployable to Vercel)
- **Stance Tracking**: Record and track your opinions on claims over time
- **Knowledge Graph**: Build a personal knowledge base stored in SurrealDB
- **No Authentication**: Uses RSS feeds and web scraping - no Reddit API credentials needed
- **Advanced Summarization**: Thread-aware hierarchical summarization, controversy detection, and cross-post theme synthesis
- **Link Fetching**: Automatically fetches and summarizes external link content
- **Budget Tracking**: Monitor and control daily LLM API usage costs

## Web Explorer

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsimonas-notcat%2Fmy-slow-news&root-directory=web&project-name=my-slow-news-explorer&repository-name=my-slow-news)

The web explorer provides a browser-based interface for exploring your knowledge base. It connects directly to your SurrealDB instance.

### Local Development

```bash
# Install dependencies
npm run web:install

# Start development server (http://localhost:3000)
npm run web

# Build for production
npm run web:build
```

### Deploy to Vercel

1. Click the "Deploy with Vercel" button above
2. Set the root directory to `web`
3. Deploy and connect to your SurrealDB instance

> **Note**: The web app connects directly to SurrealDB from the browser. For production use, ensure your SurrealDB instance is accessible via `wss://` and consider adding a backend API layer for credential security.

## ⚠️ Legal Disclaimer

**This project uses web scraping to fetch Reddit content.** Please be aware:

- Web scraping may be subject to [Reddit's Terms of Service](https://www.redditinc.com/policies/user-agreement) and [API Terms](https://www.reddit.com/wiki/api-terms)
- Reddit's terms generally require using the official API for automated access
- Excessive scraping may result in IP bans or other restrictions
- This tool is intended for personal, educational use only
- Users are responsible for ensuring their usage complies with applicable terms of service and laws
- The project maintainers assume no liability for how this tool is used

**Recommendations:**
- Use reasonable rate limits (configured by default)
- Monitor for changes in Reddit's HTML structure that may break scraping
- Consider using the official Reddit API for production or commercial use
- Be respectful of Reddit's infrastructure and community guidelines

## Tech Stack

- **Runtime**: Bun
- **AI**: Anthropic Claude via Mastra framework
- **Database**: SurrealDB (graph database)
- **Language**: TypeScript

## Prerequisites

- [Bun](https://bun.sh/) installed
- [Docker](https://www.docker.com/) and Docker Compose installed
- Anthropic API key (see below)

## Getting API Keys & Services

### Anthropic (Required)

Anthropic provides the Claude AI models used for summarization and claim extraction.

1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up for an account
3. Navigate to **API Keys** and create a new key
4. Copy the key (starts with `sk-ant-`)
5. Add to your `.env` file as `ANTHROPIC_API_KEY`

**Pricing**: Pay-as-you-go. Claude Sonnet costs ~$3/million input tokens, ~$15/million output tokens. A typical daily digest costs $0.05-0.20 depending on content volume.

### SurrealDB (Required)

SurrealDB is the graph database that stores claims and stances.

#### Option 1: Local Docker (Recommended for Development)

```bash
docker-compose up surrealdb -d
```

No signup required. Data persists in a Docker volume.

#### Option 2: Surreal Cloud (Recommended for Production)

1. Go to [surrealdb.com/cloud](https://surrealdb.com/cloud)
2. Sign up and create a new instance
3. Choose a region and instance size (free tier available)
4. Copy your connection URL (e.g., `wss://your-instance.surrealdb.cloud/rpc`)
5. Set your namespace, database, username, and password
6. Add to `.env`:
   ```
   DATABASE_URL=wss://your-instance.surrealdb.cloud/rpc
   SURREALDB_USERNAME=your-username
   SURREALDB_PASSWORD=your-password
   ```

**Pricing**: Free tier includes 1GB storage. Paid plans start at $29/month.

### OpenAI (Optional)

Only required if you enable semantic features like claim deduplication or contradiction detection.

1. Go to [platform.openai.com](https://platform.openai.com/)
2. Sign up and navigate to **API Keys**
3. Create a new secret key
4. Add to your `.env` file as `OPENAI_API_KEY`

**Pricing**: Embeddings (text-embedding-3-small) cost ~$0.02/million tokens.

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd my-slow-news
bun install
```

### 2. Configure Environment

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:

```
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL=ws://localhost:8000/rpc
```

### 3. Start the Database

Start SurrealDB using Docker Compose:

```bash
docker-compose up surrealdb -d
```

This will:
- Start SurrealDB on port 8000
- Create a persistent volume for data storage
- Use credentials: `root`/`root` (change in production!)

### 4. Initialize Database Schema

```bash
bun run db:init
```

### 5. Configure Subreddits

Edit `config.yaml` to customize your news sources:

```yaml
sources:
  reddit:
    subreddits:
      - programming
      - rust
      - typescript
    posts_per_subreddit: 5
```

### 6. Generate Your First Digest

```bash
bun run digest
```

Your digest will be saved to `./digests/YYYY-MM-DD.md`

## Available Commands

### Digest Generation

```bash
# Generate today's digest
bun run digest

# Generate digest for specific date
bun run digest -d 2025-01-15

# Generate digest for date range
bun run digest --from 2025-01-01 --to 2025-01-07
```

### Interactive Data Explorer

The interactive CLI explorer provides a rich terminal UI for browsing your knowledge base:

```bash
# Launch interactive explorer
bun run query

# Start with filters pre-applied
bun run query -d 7               # Last 7 days
bun run query -s Rust            # Filter by subject
bun run query -p is-better-than  # Filter by predicate
```

**Keyboard Shortcuts:**

| Key | Action |
|-----|--------|
| `↑/k`, `↓/j` | Navigate claims |
| `←/h`, `→/l` | Previous/next page |
| `Enter` | View claim details |
| `s` | Quick stance (agree/disagree/neutral/uncertain) |
| `f` | Open filter panel |
| `r` | Reset filters |
| `?` | Show help |
| `q` | Quit |

**In Detail View:**

| Key | Action |
|-----|--------|
| `a/d/n/u` | Set stance (agree/disagree/neutral/uncertain) |
| `e` | Edit note |
| `Esc` | Go back |

### Legacy Query Commands

The original non-interactive query commands are still available:

```bash
# Query claims containing a subject
bun run query:legacy claims -s "Rust" -d 30

# Find recurring themes
bun run query:legacy themes programming -d 30

# View your recorded stances
bun run query:legacy my-stances
```

### Stance Recording

Record your opinion on a claim:

```bash
bun run stance "Rust is-safer-than C++" agree -n "Memory safety by default"
```

Options: `agree`, `disagree`, `neutral`, `uncertain`

### Predicate Management

```bash
# View all predicates
bun run predicates --all

# View only built-in predicates
bun run predicates
```

### Development

```bash
# Run in watch mode
bun run dev

# Run tests
bun test

# Type checking
bun run typecheck
```

## Docker Compose Services

The `docker-compose.yml` provides three services:

### 1. Database Only (Recommended for Development)

```bash
docker-compose up surrealdb -d
```

Then run commands locally with `bun run ...`

### 2. Full Application Stack

```bash
docker-compose up -d
```

Runs:
- SurrealDB database
- Application container
- Cron service (generates daily digest at 7 AM)

### 3. Managing Services

```bash
# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop and remove volumes (⚠️ deletes data)
docker-compose down -v
```

## Configuration

Edit `config.yaml` to customize:

```yaml
sources:
  reddit:
    subreddits: [programming, rust, typescript]
    posts_per_subreddit: 5
    lookback_hours: 24
    min_relative_score: 1.0
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

# Advanced summarization features
summarization:
  hierarchical:
    enabled: true            # Thread-aware summarization
  controversy:
    enabled: true            # Detect controversial topics
    use_cot: true            # Chain-of-thought reasoning
  theme_synthesis:
    enabled: true            # Cross-post theme detection

# Link fetching for external content
link_fetching:
  enabled: true
  timeout_ms: 10000
  blocked_domains: [twitter.com, x.com, facebook.com, instagram.com, tiktok.com]
```

## Project Structure

```
src/
├── agents/           # AI agents (summarizer, extractor)
├── cli/              # CLI commands
│   ├── digest.ts     # Digest generation
│   ├── stance.ts     # Stance recording
│   ├── predicates.ts # Predicate management
│   └── explorer/     # Interactive terminal UI (Ink-based)
│       ├── components/   # UI components
│       ├── screens/      # Full-screen views
│       ├── context/      # React context providers
│       ├── hooks/        # Custom React hooks
│       └── utils/        # Query builders, formatters
├── config/           # Configuration loading
├── db/               # SurrealDB schema and connection
├── sources/
│   ├── reddit/       # Reddit RSS + scraping client
│   └── utils/        # Rate limiting, user agent rotation
├── types/            # TypeScript types
├── utils/            # Shared utilities
│   ├── budget-tracker.ts        # LLM usage tracking
│   ├── comment-selector.ts      # Diverse comment selection
│   ├── controversy-detector.ts  # Controversy scoring
│   ├── cot-summarizer.ts        # Chain-of-thought summarization
│   ├── hierarchical-summarizer.ts # Thread-aware summarization
│   ├── link-fetcher.ts          # External link content fetching
│   └── theme-synthesizer.ts     # Cross-post theme synthesis
└── workflows/        # Mastra workflows

digests/              # Generated markdown digests
config.yaml           # Main configuration
```

## Database Schema

- `post`: Reddit posts
- `comment`: Reddit comments
- `claim`: Extracted RDF triples
- `claim_stances`: User stances and community sentiment
- `digest`: Digest metadata
- `predicate`: Predicate ontology (e.g., `is-better-than`, `released`)

## How It Works

1. **Fetch**: Scrapes Reddit via RSS feeds (no authentication needed)
2. **Fetch Links**: Optionally fetches and extracts content from external links
3. **Select Comments**: Intelligently selects diverse comments (top-scored, controversial, contrarian)
4. **Summarize**: Claude AI summarizes posts using hierarchical thread-aware summarization
5. **Detect Controversy**: Identifies controversial topics using chain-of-thought reasoning
6. **Synthesize Themes**: Discovers recurring themes across multiple posts
7. **Extract Claims**: Extracts factual claims as structured RDF triples
8. **Store**: Saves to SurrealDB graph database
9. **Generate**: Creates markdown digest file

## Development

For AI assistants working on this codebase, see [`CLAUDE.md`](./CLAUDE.md) for detailed development guidelines.

## License

MIT
