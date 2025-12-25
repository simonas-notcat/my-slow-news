# LLM and SurrealDB Code Audit

**Date:** 2025-12-25
**Scope:** `src/agents/`, `src/db/`, `src/workflows/`, `src/cli/`

---

## Executive Summary

The codebase has a solid foundation but has several areas for improvement around reliability, security, and best practices. This document outlines findings and actionable recommendations.

---

## LLM Code Findings

### 1. Brittle JSON Parsing (HIGH)

**Location:** `src/workflows/digest.ts:98-108, 168-178`

**Issue:** Agents return free-form text that's parsed with regex:
```typescript
const jsonMatch = text.match(/\{[\s\S]*\}/);
let summary = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: text };
```

**Risk:** LLM may include explanatory text, nested objects, or malformed JSON causing parse failures.

**Recommendation:** Use Mastra's structured output or Anthropic's tool_use mode:
```typescript
// Option 1: Define output schema with Zod and use structured generation
const result = await agent.generate(prompt, {
  output: SummarySchema,  // Zod schema
});

// Option 2: Use tool_use to force structured responses
// Define the response as a tool the model must call
```

---

### 2. Budget Not Enforced (MEDIUM)

**Location:** `src/types/index.ts:18` (config), unused everywhere

**Issue:** `daily_budget_usd: 5.0` is defined but never checked.

**Recommendation:** Track usage and enforce limits:
```typescript
// src/llm/usage-tracker.ts
interface UsageTracker {
  todaysCost: number;
  checkBudget(estimatedCost: number): boolean;
  recordUsage(response: LLMResponse): void;
}

// Before each LLM call:
if (!usageTracker.checkBudget(estimatedCost)) {
  throw new Error("Daily budget exceeded");
}
```

---

### 3. No Retry Logic (MEDIUM)

**Location:** `src/workflows/digest.ts:93-122`

**Issue:** Single try/catch with immediate fallback; transient errors (rate limits, network) cause data loss.

**Recommendation:** Add exponential backoff:
```typescript
import { retry } from "@mastra/core/utils"; // or implement custom

const result = await retry(
  () => agent.generate(prompt),
  {
    maxAttempts: 3,
    backoff: "exponential",
    retryableErrors: ["rate_limit", "timeout", "network"],
  }
);
```

---

### 4. Config Model Not Used (LOW)

**Location:** `src/agents/index.ts:29, 85`

**Issue:** Model hardcoded as `"anthropic/claude-sonnet-4-20250514"`, ignoring config.

**Recommendation:** Pass model from config:
```typescript
// src/agents/index.ts
export function createSummarizerAgent(config: Config) {
  return new Agent({
    name: "summarizer",
    model: config.llm.model,
    // ...
  });
}
```

---

### 5. Tools Defined But Not Used (LOW)

**Location:** `src/agents/index.ts:30, 86`

**Issue:** `saveDigestTool` and `extractClaimsTool` are assigned but workflow manually handles their logic.

**Recommendation:** Either:
- Remove unused tool assignments, OR
- Refactor workflow to let agents invoke tools autonomously

---

### 6. Sequential Processing (LOW)

**Location:** `src/workflows/digest.ts:72-123`

**Issue:** Posts summarized one-by-one in a loop.

**Recommendation:** Use Promise.allSettled for parallel processing with concurrency limit:
```typescript
import pLimit from "p-limit";

const limit = pLimit(3); // Max 3 concurrent
const summaries = await Promise.allSettled(
  posts.map(post => limit(() => summarizePost(post)))
);
```

---

## SurrealDB Findings

### 1. Hardcoded Default Credentials (HIGH)

**Location:** `src/db/index.ts:19-22`

**Issue:**
```typescript
username: process.env.SURREALDB_USERNAME || "root",
password: process.env.SURREALDB_PASSWORD || "root",
```

**Risk:** Production systems may accidentally use root/root if env vars not set.

**Recommendation:** Require credentials explicitly:
```typescript
const username = process.env.SURREALDB_USERNAME;
const password = process.env.SURREALDB_PASSWORD;

if (!username || !password) {
  throw new Error(
    "SURREALDB_USERNAME and SURREALDB_PASSWORD environment variables are required"
  );
}
```

---

### 2. Connection Resource Leak (MEDIUM)

**Location:** `src/db/index.ts:11-36`

**Issue:** If `signin` or `use` fails after successful `connect`, the connection isn't closed.

**Recommendation:** Use try/finally pattern:
```typescript
export async function getDb(config: Config): Promise<Surreal> {
  if (db) return db;

  const newDb = new Surreal();

  try {
    await newDb.connect(config.database.url);
    await newDb.signin({ username, password });
    await newDb.use({ namespace, database });
    db = newDb;
    return db;
  } catch (error) {
    await newDb.close().catch(() => {}); // Clean up on failure
    throw error;
  }
}
```

---

### 3. No Transaction Usage (MEDIUM)

**Location:** `src/cli/stance.ts:56-126`

**Issue:** Multi-step operations without transactions:
1. Query for existing claim
2. Create claim if not exists
3. Query for existing stance
4. Create/update stance

If step 3 or 4 fails, orphaned claim record remains.

**Recommendation:** Wrap in transaction:
```typescript
await db.query("BEGIN TRANSACTION");
try {
  // ... operations
  await db.query("COMMIT TRANSACTION");
} catch (error) {
  await db.query("CANCEL TRANSACTION");
  throw error;
}
```

---

### 4. No Reconnection Logic (MEDIUM)

**Location:** `src/db/index.ts`

**Issue:** Single connection with no health check or reconnection on failure.

**Recommendation:** Add connection health check:
```typescript
export async function getDb(config: Config): Promise<Surreal> {
  if (db) {
    try {
      await db.query("SELECT 1"); // Health check
      return db;
    } catch {
      db = null; // Connection dead, reconnect
    }
  }
  // ... reconnect logic
}
```

---

### 5. Loose Type Safety (LOW)

**Location:** `src/cli/query.ts:30, 46, 112` and throughout

**Issue:** Extensive `any[][]` typing loses type safety:
```typescript
const predicates = await db.query<any[][]>(...);
```

**Recommendation:** Define result types:
```typescript
interface PredicateCount {
  predicate: string;
  count: number;
}

const [predicates] = await db.query<[PredicateCount[]]>(`
  SELECT predicate, count() as count FROM claim ...
`);
```

---

### 6. Schema Migration Strategy (LOW)

**Location:** `src/db/init.ts:23-34`

**Issue:** Relies on "already exists" error suppression; no migration versioning.

**Recommendation:** Implement migration tracking:
```typescript
// Track applied migrations
DEFINE TABLE _migrations SCHEMAFULL;
DEFINE FIELD name ON _migrations TYPE string;
DEFINE FIELD applied_at ON _migrations TYPE datetime;

// Check before applying
const applied = await db.query(
  "SELECT name FROM _migrations WHERE name = $name",
  { name: "001_initial_schema" }
);
if (!applied[0]?.length) {
  await db.query(SCHEMA_001);
  await db.query(
    "CREATE _migrations SET name = $name, applied_at = time::now()",
    { name: "001_initial_schema" }
  );
}
```

---

### 7. Database Persistence Not Implemented (HIGH)

**Location:** `src/workflows/digest.ts:276-288`

**Issue:** The `save-to-database` step is a placeholder:
```typescript
execute: async ({ inputData }) => {
  console.log(`Database save skipped (not implemented yet)`);
  return inputData;
}
```

**Recommendation:** Implement database persistence:
```typescript
const saveToDatabaseStep = createStep({
  id: "save-to-database",
  // ...
  execute: async ({ inputData }) => {
    const config = loadConfig();
    const db = await getDb(config);

    // Save posts, claims, and digest record
    // Use transactions for atomicity
    // ...
  }
});
```

---

## Priority Matrix

| Finding | Severity | Effort | Priority | Status |
|---------|----------|--------|----------|--------|
| Database persistence not implemented | HIGH | Medium | 1 | ✅ FIXED |
| Hardcoded default credentials | HIGH | Low | 2 | ✅ FIXED |
| Brittle JSON parsing | HIGH | Medium | 3 | ✅ FIXED |
| No transaction usage | MEDIUM | Low | 4 | ✅ FIXED |
| Connection resource leak | MEDIUM | Low | 5 | ✅ FIXED |
| No retry logic for LLM | MEDIUM | Low | 6 | ✅ FIXED |
| Budget not enforced | MEDIUM | Medium | 7 | ✅ FIXED |
| No reconnection logic | MEDIUM | Medium | 8 | ✅ FIXED |
| Config model not used | LOW | Low | 9 | ✅ FIXED |
| Loose type safety | LOW | Medium | 10 | ✅ FIXED |
| Sequential processing | LOW | Medium | 11 | Not fixed |
| Schema migration strategy | LOW | Medium | 12 | Not fixed |
| Unused tool assignments | LOW | Low | 13 | Not fixed |

---

## Implementation Summary

### Commits

1. **Fix high priority audit issues** (19db6d2)
   - Removed hardcoded credentials, require env vars
   - Implemented full database persistence with transactions
   - Added robust JSON parsing utility with multiple strategies

2. **Fix remaining audit issues** (ef90fe6)
   - Added transactions to stance.ts
   - Created retry utility with exponential backoff
   - Implemented budget tracker with cost estimation
   - Added database reconnection with health checks
   - Made agents use config model
   - Improved type safety in CLI queries

### New Files Created

- `src/utils/parse-llm-json.ts` - Robust JSON extraction from LLM responses
- `src/utils/retry.ts` - Retry with exponential backoff
- `src/utils/budget-tracker.ts` - Daily budget tracking and enforcement

### Remaining Items (Low Priority)

1. **Sequential processing** - Could parallelize with p-limit for better performance
2. **Schema migration strategy** - Would need migration tracking table
3. **Unused tool assignments** - Tools assigned to agents but not used in workflow

---

## Additional Audit (2025-12-25)

### New Findings and Fixes

#### 1. Reddit API Retry Logic (MEDIUM) ✅ FIXED

**Location:** `src/reddit/client.ts`

**Issue:** Reddit API calls had no retry logic for transient failures (rate limits, network errors).

**Fix:** Added `withRetry` wrapper to all Reddit API calls (token fetch, posts, comments) with exponential backoff.

---

#### 2. Input Validation for Subreddit Names (MEDIUM) ✅ FIXED

**Location:** `src/reddit/client.ts`

**Issue:** Subreddit names were not validated, allowing potential URL injection.

**Fix:** Added `validateSubredditName()` function that validates subreddit names match Reddit's format (3-21 alphanumeric chars).

---

#### 3. Comments Not Persisted to Database (MEDIUM) ✅ FIXED

**Location:** `src/workflows/digest.ts`

**Issue:** Comments were fetched but never saved to the database - only posts and claims were persisted.

**Fix:**
- Updated workflow schemas to pass comments through all steps
- Added comment persistence in `save-to-database` step with upsert logic

---

#### 4. Enhanced Date Validation in CLI (LOW) ✅ FIXED

**Location:** `src/cli/digest.ts`

**Issue:** Date validation was basic; didn't catch invalid dates like `2024-02-30`.

**Fix:**
- Enhanced `isValidDate()` to verify parsed date components match input
- Added `isFutureDate()` check with warning for future dates

---

#### 5. Graceful Shutdown Handling (LOW) ✅ FIXED

**Location:** `src/cli/digest.ts`

**Issue:** No graceful shutdown handling for SIGINT/SIGTERM signals.

**Fix:** Added signal handlers that close database connection before exit.

---

#### 6. Duplicate Sleep Utility (LOW) ✅ FIXED

**Location:** `src/reddit/index.ts`, `src/utils/retry.ts`

**Issue:** `sleep` function was defined in multiple files.

**Fix:** Exported `sleep` from `src/utils/retry.ts` and updated reddit module to use it.

---

### Updated Priority Matrix

| Finding | Severity | Effort | Status |
|---------|----------|--------|--------|
| Reddit API retry logic | MEDIUM | Low | ✅ FIXED |
| Subreddit name validation | MEDIUM | Low | ✅ FIXED |
| Comments not persisted | MEDIUM | Medium | ✅ FIXED |
| Enhanced date validation | LOW | Low | ✅ FIXED |
| Graceful shutdown | LOW | Low | ✅ FIXED |
| Duplicate sleep utility | LOW | Low | ✅ FIXED |

### Commits

3. **Code audit improvements** (current)
   - Added retry logic to all Reddit API calls
   - Added subreddit name validation to prevent URL injection
   - Implemented comment persistence in database workflow
   - Enhanced CLI date validation with future date warning
   - Added graceful shutdown handling with SIGINT/SIGTERM
   - Consolidated sleep utility to avoid duplication
