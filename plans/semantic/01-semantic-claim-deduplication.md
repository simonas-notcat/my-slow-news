# Feature 1: Semantic Claim Deduplication

## Overview

Implement semantic deduplication for claims to prevent the same factual claim from being stored multiple times when expressed differently.

### Problem Statement

The claim extraction process currently stores claims based on exact triple matching (subject, predicate, object). This leads to duplicate claims:

| Claim A | Claim B | Same Meaning? |
|---------|---------|---------------|
| Rust is-safer-than C++ | C++ has memory-bugs Rust lacks | Yes |
| TypeScript improves code-quality | TypeScript helps catch-bugs | Partially |
| Go has fast-compilation | Go compiles quickly | Yes |

These duplicates:
- Bloat the knowledge base
- Fragment stance tracking
- Make queries less accurate
- Reduce insight quality

### Solution

Before storing new claims:
1. Generate embedding for the claim text
2. Query SurrealDB for similar existing claims
3. If similarity > threshold: link as duplicate instead of creating new
4. Merge stance data for equivalent claims

---

## Implementation Plan

### Step 1: Embedding Infrastructure

Create the core embedding service that all semantic features will use.

#### 1.1 Create Embedding Provider Interface

**File:** `src/embeddings/types.ts`

```typescript
export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingConfig {
  provider: 'openai' | 'ollama';
  model: string;
  dimensions: number;
  cacheEnabled: boolean;
  batchSize: number;
}

export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: string;
  cached: boolean;
}
```

#### 1.2 Implement OpenAI Provider

**File:** `src/embeddings/providers/openai.ts`

```typescript
import type { EmbeddingProvider } from '../types';

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = 'openai';
  dimensions: number;
  private apiKey: string;
  private model: string;

  constructor(config: { model: string; dimensions: number }) {
    this.apiKey = process.env.OPENAI_API_KEY!;
    this.model = config.model;
    this.dimensions = config.dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }
}
```

#### 1.3 Implement Ollama Provider (Local)

**File:** `src/embeddings/providers/ollama.ts`

```typescript
import type { EmbeddingProvider } from '../types';

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  name = 'ollama';
  dimensions: number;
  private baseUrl: string;
  private model: string;

  constructor(config: { baseUrl: string; model: string; dimensions: number }) {
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.dimensions = config.dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama doesn't support batch, run sequentially
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }
}
```

#### 1.4 Create Main Embedding Service

**File:** `src/embeddings/index.ts`

```typescript
import type { EmbeddingProvider, EmbeddingConfig, EmbeddingResult } from './types';
import { OpenAIEmbeddingProvider } from './providers/openai';
import { OllamaEmbeddingProvider } from './providers/ollama';
import { EmbeddingCache } from './cache';

export class EmbeddingService {
  private provider: EmbeddingProvider;
  private cache: EmbeddingCache | null;
  private batchSize: number;

  constructor(config: EmbeddingConfig) {
    this.provider = this.createProvider(config);
    this.cache = config.cacheEnabled ? new EmbeddingCache() : null;
    this.batchSize = config.batchSize;
  }

  private createProvider(config: EmbeddingConfig): EmbeddingProvider {
    switch (config.provider) {
      case 'openai':
        return new OpenAIEmbeddingProvider({
          model: config.model,
          dimensions: config.dimensions,
        });
      case 'ollama':
        return new OllamaEmbeddingProvider({
          baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
          model: config.model,
          dimensions: config.dimensions,
        });
      default:
        throw new Error(`Unknown embedding provider: ${config.provider}`);
    }
  }

  async embed(text: string): Promise<EmbeddingResult> {
    // Check cache first
    if (this.cache) {
      const cached = await this.cache.get(text);
      if (cached) {
        return { text, embedding: cached, model: this.provider.name, cached: true };
      }
    }

    const embedding = await this.provider.embed(text);

    // Store in cache
    if (this.cache) {
      await this.cache.set(text, embedding);
    }

    return { text, embedding, model: this.provider.name, cached: false };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    const uncached: { text: string; index: number }[] = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      if (this.cache) {
        const cached = await this.cache.get(texts[i]);
        if (cached) {
          results[i] = {
            text: texts[i],
            embedding: cached,
            model: this.provider.name,
            cached: true,
          };
          continue;
        }
      }
      uncached.push({ text: texts[i], index: i });
    }

    // Embed uncached texts in batches
    for (let i = 0; i < uncached.length; i += this.batchSize) {
      const batch = uncached.slice(i, i + this.batchSize);
      const embeddings = await this.provider.embedBatch(batch.map((b) => b.text));

      for (let j = 0; j < batch.length; j++) {
        const { text, index } = batch[j];
        const embedding = embeddings[j];

        results[index] = {
          text,
          embedding,
          model: this.provider.name,
          cached: false,
        };

        if (this.cache) {
          await this.cache.set(text, embedding);
        }
      }
    }

    return results;
  }

  get dimensions(): number {
    return this.provider.dimensions;
  }
}

// Singleton instance
let embeddingService: EmbeddingService | null = null;

export function getEmbeddingService(config: EmbeddingConfig): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService(config);
  }
  return embeddingService;
}

export function resetEmbeddingService(): void {
  embeddingService = null;
}
```

#### 1.5 Implement Simple Cache

**File:** `src/embeddings/cache.ts`

```typescript
import { createHash } from 'crypto';

export class EmbeddingCache {
  private cache: Map<string, number[]> = new Map();
  private maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  private hash(text: string): string {
    return createHash('sha256').update(text).digest('hex').slice(0, 16);
  }

  async get(text: string): Promise<number[] | null> {
    const key = this.hash(text);
    return this.cache.get(key) || null;
  }

  async set(text: string, embedding: number[]): Promise<void> {
    const key = this.hash(text);

    // Simple LRU: remove oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, embedding);
  }

  clear(): void {
    this.cache.clear();
  }
}
```

---

### Step 2: Database Schema Updates

#### 2.1 Add Embedding Fields to Schema

**File:** `src/db/schema.ts` (additions)

```typescript
export const VECTOR_SCHEMA = `
-- Add embedding fields to claim table
DEFINE FIELD embedding ON claim TYPE option<array<float>>;
DEFINE FIELD embedding_model ON claim TYPE option<string>;
DEFINE FIELD embedded_at ON claim TYPE option<datetime>;

-- Vector index for similarity search
-- Note: SurrealDB uses MTREE for vector indexes
DEFINE INDEX idx_claim_embedding ON claim
  FIELDS embedding MTREE DIMENSION 1536
  DIST COSINE;

-- Claim similarity relations
DEFINE TABLE claim_similarity TYPE RELATION
  FROM claim TO claim SCHEMAFULL;
DEFINE FIELD similarity ON claim_similarity TYPE float;
DEFINE FIELD relationship ON claim_similarity TYPE string;
  -- Values: 'duplicate', 'related', 'contradicts'
DEFINE FIELD detected_at ON claim_similarity TYPE datetime;
DEFINE INDEX idx_claim_similarity_rel ON claim_similarity FIELDS relationship;

-- Canonical claim tracking (for deduplication)
DEFINE FIELD canonical_claim ON claim TYPE option<record<claim>>;
  -- If set, this claim is a duplicate of the canonical claim
DEFINE FIELD is_canonical ON claim TYPE bool DEFAULT true;
  -- False if this claim has been marked as duplicate of another
`;
```

#### 2.2 Create Migration Script

**File:** `src/db/migrations/001-vector-schema.ts`

```typescript
import type Surreal from 'surrealdb';
import { VECTOR_SCHEMA } from '../schema';

export async function migrateVectorSchema(db: Surreal): Promise<void> {
  console.log('Applying vector schema migration...');

  try {
    await db.query(VECTOR_SCHEMA);
    console.log('Vector schema applied successfully');
  } catch (error) {
    console.error('Failed to apply vector schema:', error);
    throw error;
  }
}
```

#### 2.3 Update Init Script

**File:** `src/db/init.ts` (additions)

```typescript
import { migrateVectorSchema } from './migrations/001-vector-schema';

// Add to existing init function:
export async function initDatabase(db: Surreal): Promise<void> {
  // ... existing schema init ...

  // Apply vector schema
  await migrateVectorSchema(db);
}
```

---

### Step 3: Claim Embedding & Similarity

#### 3.1 Claim Text Formatting

**File:** `src/embeddings/claim-formatter.ts`

```typescript
import type { ClaimRecord } from '../types';

/**
 * Format a claim for embedding.
 * Converts the RDF triple into a natural language sentence.
 */
export function formatClaimForEmbedding(claim: {
  subject: string;
  predicate: string;
  object: string;
}): string {
  // Convert kebab-case predicate to natural language
  const predicate = claim.predicate.replace(/-/g, ' ');

  return `${claim.subject} ${predicate} ${claim.object}`;
}

/**
 * Format multiple claims for batch embedding.
 */
export function formatClaimsForEmbedding(
  claims: Array<{ subject: string; predicate: string; object: string }>
): string[] {
  return claims.map(formatClaimForEmbedding);
}
```

#### 3.2 Similarity Search Utilities

**File:** `src/embeddings/similarity.ts`

```typescript
import type Surreal from 'surrealdb';
import type { ClaimRecord } from '../types';

export interface SimilarClaim {
  claim: ClaimRecord;
  similarity: number;
}

/**
 * Find claims similar to the given embedding.
 */
export async function findSimilarClaims(
  db: Surreal,
  embedding: number[],
  options: {
    limit?: number;
    minSimilarity?: number;
    excludeIds?: string[];
  } = {}
): Promise<SimilarClaim[]> {
  const { limit = 10, minSimilarity = 0.5, excludeIds = [] } = options;

  // SurrealDB vector similarity search
  const query = `
    SELECT
      *,
      vector::similarity::cosine(embedding, $embedding) AS similarity
    FROM claim
    WHERE
      embedding IS NOT NONE
      AND is_canonical = true
      ${excludeIds.length > 0 ? 'AND id NOT IN $excludeIds' : ''}
    ORDER BY similarity DESC
    LIMIT $limit
  `;

  const results = await db.query<[SimilarClaim[]]>(query, {
    embedding,
    limit,
    excludeIds,
  });

  // Filter by minimum similarity
  return (results[0] || []).filter((r) => r.similarity >= minSimilarity);
}

/**
 * Compute cosine similarity between two embeddings.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

---

### Step 4: Deduplication Logic

#### 4.1 Create Deduplication Service

**File:** `src/embeddings/deduplication.ts`

```typescript
import type Surreal from 'surrealdb';
import type { ClaimRecord } from '../types';
import { EmbeddingService } from './index';
import { formatClaimForEmbedding } from './claim-formatter';
import { findSimilarClaims, type SimilarClaim } from './similarity';

export interface DeduplicationConfig {
  duplicateThreshold: number;  // e.g., 0.92
  relatedThreshold: number;    // e.g., 0.75
}

export interface DeduplicationResult {
  isNew: boolean;
  claim: ClaimRecord;
  duplicateOf?: ClaimRecord;
  relatedClaims: SimilarClaim[];
}

export class ClaimDeduplicationService {
  constructor(
    private db: Surreal,
    private embeddings: EmbeddingService,
    private config: DeduplicationConfig
  ) {}

  /**
   * Check if a claim is a duplicate and handle accordingly.
   * Returns the canonical claim (either existing or newly created).
   */
  async processNewClaim(claim: {
    subject: string;
    predicate: string;
    object: string;
    confidence: number;
  }): Promise<DeduplicationResult> {
    // Generate embedding for the new claim
    const claimText = formatClaimForEmbedding(claim);
    const { embedding } = await this.embeddings.embed(claimText);

    // Search for similar existing claims
    const similar = await findSimilarClaims(this.db, embedding, {
      limit: 10,
      minSimilarity: this.config.relatedThreshold,
    });

    // Check for duplicates (high similarity)
    const duplicate = similar.find(
      (s) => s.similarity >= this.config.duplicateThreshold
    );

    if (duplicate) {
      // This claim is a duplicate - link it instead of creating new
      return await this.handleDuplicate(claim, embedding, duplicate);
    }

    // No duplicate - create new canonical claim
    return await this.createNewClaim(claim, embedding, similar);
  }

  private async handleDuplicate(
    claim: { subject: string; predicate: string; object: string; confidence: number },
    embedding: number[],
    duplicate: SimilarClaim
  ): Promise<DeduplicationResult> {
    // Create the claim as non-canonical, linked to the duplicate
    const [created] = await this.db.query<[ClaimRecord[]]>(`
      CREATE claim SET
        subject = $subject,
        predicate = $predicate,
        object = $object,
        confidence = $confidence,
        embedding = $embedding,
        embedding_model = $model,
        embedded_at = time::now(),
        extracted_at = time::now(),
        is_canonical = false,
        canonical_claim = $canonical
    `, {
      ...claim,
      embedding,
      model: this.embeddings.name,
      canonical: duplicate.claim.id,
    });

    // Create similarity relation
    await this.db.query(`
      RELATE $from->claim_similarity->$to SET
        similarity = $similarity,
        relationship = 'duplicate',
        detected_at = time::now()
    `, {
      from: created[0].id,
      to: duplicate.claim.id,
      similarity: duplicate.similarity,
    });

    // Update canonical claim confidence if new claim has higher confidence
    if (claim.confidence > duplicate.claim.confidence) {
      await this.db.query(`
        UPDATE $id SET confidence = $confidence
      `, {
        id: duplicate.claim.id,
        confidence: claim.confidence,
      });
    }

    return {
      isNew: false,
      claim: duplicate.claim,
      duplicateOf: duplicate.claim,
      relatedClaims: [],
    };
  }

  private async createNewClaim(
    claim: { subject: string; predicate: string; object: string; confidence: number },
    embedding: number[],
    related: SimilarClaim[]
  ): Promise<DeduplicationResult> {
    // Create new canonical claim
    const [created] = await this.db.query<[ClaimRecord[]]>(`
      CREATE claim SET
        subject = $subject,
        predicate = $predicate,
        object = $object,
        confidence = $confidence,
        embedding = $embedding,
        embedding_model = $model,
        embedded_at = time::now(),
        extracted_at = time::now(),
        is_canonical = true
    `, {
      ...claim,
      embedding,
      model: 'text-embedding-3-small',
    });

    // Create similarity relations for related claims
    for (const rel of related) {
      await this.db.query(`
        RELATE $from->claim_similarity->$to SET
          similarity = $similarity,
          relationship = 'related',
          detected_at = time::now()
      `, {
        from: created[0].id,
        to: rel.claim.id,
        similarity: rel.similarity,
      });
    }

    return {
      isNew: true,
      claim: created[0],
      relatedClaims: related,
    };
  }

  /**
   * Backfill embeddings for existing claims without embeddings.
   */
  async backfillEmbeddings(options: {
    batchSize?: number;
    onProgress?: (processed: number, total: number) => void;
  } = {}): Promise<{ processed: number; errors: number }> {
    const { batchSize = 50, onProgress } = options;

    // Get claims without embeddings
    const [claims] = await this.db.query<[ClaimRecord[]]>(`
      SELECT * FROM claim
      WHERE embedding IS NONE AND is_canonical = true
    `);

    const total = claims.length;
    let processed = 0;
    let errors = 0;

    // Process in batches
    for (let i = 0; i < claims.length; i += batchSize) {
      const batch = claims.slice(i, i + batchSize);
      const texts = batch.map(formatClaimForEmbedding);

      try {
        const results = await this.embeddings.embedBatch(texts);

        for (let j = 0; j < batch.length; j++) {
          await this.db.query(`
            UPDATE $id SET
              embedding = $embedding,
              embedding_model = $model,
              embedded_at = time::now()
          `, {
            id: batch[j].id,
            embedding: results[j].embedding,
            model: results[j].model,
          });
        }

        processed += batch.length;
      } catch (error) {
        console.error(`Error embedding batch at ${i}:`, error);
        errors += batch.length;
      }

      onProgress?.(processed, total);
    }

    return { processed, errors };
  }

  /**
   * Detect duplicates among existing claims (for retroactive dedup).
   */
  async detectExistingDuplicates(): Promise<{
    duplicatePairs: Array<{ claim1: string; claim2: string; similarity: number }>;
  }> {
    const duplicatePairs: Array<{ claim1: string; claim2: string; similarity: number }> = [];

    // Get all canonical claims with embeddings
    const [claims] = await this.db.query<[ClaimRecord[]]>(`
      SELECT * FROM claim
      WHERE embedding IS NOT NONE AND is_canonical = true
    `);

    // Compare each pair (O(n^2) but fine for reasonable claim counts)
    for (let i = 0; i < claims.length; i++) {
      for (let j = i + 1; j < claims.length; j++) {
        const similarity = await this.computeSimilarity(
          claims[i].embedding!,
          claims[j].embedding!
        );

        if (similarity >= this.config.duplicateThreshold) {
          duplicatePairs.push({
            claim1: claims[i].id as string,
            claim2: claims[j].id as string,
            similarity,
          });
        }
      }
    }

    return { duplicatePairs };
  }

  private async computeSimilarity(a: number[], b: number[]): Promise<number> {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
```

---

### Step 5: Integration with Claim Extraction

#### 5.1 Update Extract Claims Tool

**File:** `src/agents/tools/extract-claims.ts` (modifications)

Add deduplication after claim extraction:

```typescript
import { ClaimDeduplicationService } from '../../embeddings/deduplication';
import { getEmbeddingService } from '../../embeddings';

// In the execute function, after extracting claims:
async function saveClaims(
  db: Surreal,
  claims: ExtractedClaim[],
  config: Config
): Promise<ClaimRecord[]> {
  const embeddingService = getEmbeddingService(config.embeddings);
  const deduper = new ClaimDeduplicationService(
    db,
    embeddingService,
    {
      duplicateThreshold: config.semantic.deduplication.similarity_threshold,
      relatedThreshold: config.semantic.deduplication.related_threshold,
    }
  );

  const results: ClaimRecord[] = [];

  for (const claim of claims) {
    const result = await deduper.processNewClaim({
      subject: claim.subject,
      predicate: claim.predicate,
      object: claim.object,
      confidence: claim.confidence,
    });

    results.push(result.claim);

    if (!result.isNew) {
      console.log(`  Duplicate detected: "${claim.subject} ${claim.predicate} ${claim.object}"`);
      console.log(`    → Merged with existing claim (similarity: ${result.duplicateOf ? (result.duplicateOf as any).similarity?.toFixed(2) : 'N/A'})`);
    }
  }

  return results;
}
```

---

### Step 6: CLI Commands

#### 6.1 Backfill Command

**File:** `src/cli/embeddings.ts`

```typescript
import { Command } from 'commander';
import { loadConfig } from '../config';
import { getDb, closeDb } from '../db';
import { getEmbeddingService } from '../embeddings';
import { ClaimDeduplicationService } from '../embeddings/deduplication';

const program = new Command();

program
  .name('embeddings')
  .description('Manage claim embeddings');

program
  .command('backfill')
  .description('Generate embeddings for claims without them')
  .option('-b, --batch-size <size>', 'Batch size', '50')
  .action(async (options) => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const embeddingService = getEmbeddingService(config.embeddings);
      const deduper = new ClaimDeduplicationService(
        db,
        embeddingService,
        config.semantic.deduplication
      );

      console.log('Backfilling embeddings...\n');

      const { processed, errors } = await deduper.backfillEmbeddings({
        batchSize: parseInt(options.batchSize, 10),
        onProgress: (done, total) => {
          process.stdout.write(`\rProgress: ${done}/${total} claims`);
        },
      });

      console.log(`\n\nComplete: ${processed} embedded, ${errors} errors`);
    } finally {
      await closeDb();
    }
  });

program
  .command('detect-duplicates')
  .description('Find duplicate claims in existing data')
  .action(async () => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const embeddingService = getEmbeddingService(config.embeddings);
      const deduper = new ClaimDeduplicationService(
        db,
        embeddingService,
        config.semantic.deduplication
      );

      console.log('Scanning for duplicate claims...\n');

      const { duplicatePairs } = await deduper.detectExistingDuplicates();

      if (duplicatePairs.length === 0) {
        console.log('No duplicates found!');
        return;
      }

      console.log(`Found ${duplicatePairs.length} duplicate pairs:\n`);

      for (const pair of duplicatePairs) {
        console.log(`  ${pair.claim1} ↔ ${pair.claim2}`);
        console.log(`    Similarity: ${(pair.similarity * 100).toFixed(1)}%\n`);
      }
    } finally {
      await closeDb();
    }
  });

program
  .command('stats')
  .description('Show embedding statistics')
  .action(async () => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const [stats] = await db.query<[any[]]>(`
        SELECT
          count() AS total,
          count(embedding IS NOT NONE) AS with_embedding,
          count(is_canonical = true) AS canonical,
          count(is_canonical = false) AS duplicates
        FROM claim
        GROUP ALL
      `);

      const s = stats[0] || { total: 0, with_embedding: 0, canonical: 0, duplicates: 0 };

      console.log('Embedding Statistics');
      console.log('====================');
      console.log(`Total claims:     ${s.total}`);
      console.log(`With embeddings:  ${s.with_embedding} (${((s.with_embedding / s.total) * 100 || 0).toFixed(1)}%)`);
      console.log(`Canonical:        ${s.canonical}`);
      console.log(`Duplicates:       ${s.duplicates}`);
    } finally {
      await closeDb();
    }
  });

export { program as embeddingsCommand };
```

#### 6.2 Add to Package.json

```json
{
  "scripts": {
    "embeddings": "bun run src/cli/embeddings.ts",
    "embeddings:backfill": "bun run src/cli/embeddings.ts backfill",
    "embeddings:detect-duplicates": "bun run src/cli/embeddings.ts detect-duplicates",
    "embeddings:stats": "bun run src/cli/embeddings.ts stats"
  }
}
```

---

### Step 7: Configuration Updates

#### 7.1 Update Config Schema

**File:** `src/config/index.ts` (additions)

```typescript
const EmbeddingsConfigSchema = z.object({
  provider: z.enum(['openai', 'ollama']).default('openai'),
  model: z.string().default('text-embedding-3-small'),
  dimensions: z.number().default(1536),
  cache_enabled: z.boolean().default(true),
  batch_size: z.number().default(100),
  openai: z.object({
    api_key_env: z.string().default('OPENAI_API_KEY'),
  }).optional(),
  ollama: z.object({
    base_url: z.string().default('http://localhost:11434'),
    model: z.string().default('nomic-embed-text'),
  }).optional(),
});

const SemanticConfigSchema = z.object({
  deduplication: z.object({
    enabled: z.boolean().default(true),
    similarity_threshold: z.number().default(0.92),
    related_threshold: z.number().default(0.75),
  }).default({}),
});

// Add to main config schema
const ConfigSchema = z.object({
  // ... existing fields ...
  embeddings: EmbeddingsConfigSchema.default({}),
  semantic: SemanticConfigSchema.default({}),
});
```

#### 7.2 Example Config

```yaml
# config.yaml additions
embeddings:
  provider: openai
  model: text-embedding-3-small
  dimensions: 1536
  cache_enabled: true
  batch_size: 100

semantic:
  deduplication:
    enabled: true
    similarity_threshold: 0.92
    related_threshold: 0.75
```

---

### Step 8: Testing

#### 8.1 Unit Tests

**File:** `src/embeddings/claim-formatter.test.ts`

```typescript
import { describe, test, expect } from 'bun:test';
import { formatClaimForEmbedding } from './claim-formatter';

describe('formatClaimForEmbedding', () => {
  test('converts kebab-case predicates to spaces', () => {
    const result = formatClaimForEmbedding({
      subject: 'Rust',
      predicate: 'is-safer-than',
      object: 'C++',
    });
    expect(result).toBe('Rust is safer than C++');
  });

  test('handles simple predicates', () => {
    const result = formatClaimForEmbedding({
      subject: 'TypeScript',
      predicate: 'supports',
      object: 'generics',
    });
    expect(result).toBe('TypeScript supports generics');
  });
});
```

**File:** `src/embeddings/similarity.test.ts`

```typescript
import { describe, test, expect } from 'bun:test';
import { cosineSimilarity } from './similarity';

describe('cosineSimilarity', () => {
  test('returns 1 for identical vectors', () => {
    const v = [1, 2, 3, 4];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  test('returns 0 for orthogonal vectors', () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  test('returns -1 for opposite vectors', () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
  });
});
```

**File:** `src/embeddings/deduplication.test.ts`

```typescript
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { ClaimDeduplicationService } from './deduplication';

describe('ClaimDeduplicationService', () => {
  // Mock implementations for db and embedding service
  // Test processNewClaim with and without duplicates
  // Test backfillEmbeddings
  // Test detectExistingDuplicates
});
```

---

## File Summary

| File | Purpose |
|------|---------|
| `src/embeddings/types.ts` | Type definitions |
| `src/embeddings/index.ts` | Main embedding service |
| `src/embeddings/cache.ts` | In-memory embedding cache |
| `src/embeddings/providers/openai.ts` | OpenAI provider |
| `src/embeddings/providers/ollama.ts` | Ollama provider |
| `src/embeddings/claim-formatter.ts` | Claim to text conversion |
| `src/embeddings/similarity.ts` | Similarity search utilities |
| `src/embeddings/deduplication.ts` | Deduplication logic |
| `src/db/migrations/001-vector-schema.ts` | Schema migration |
| `src/cli/embeddings.ts` | CLI commands |
| `src/config/index.ts` | Config schema updates |

---

## Success Criteria

1. **Embedding Infrastructure**
   - [ ] OpenAI provider works correctly
   - [ ] Ollama provider works as fallback
   - [ ] Caching reduces API calls by >80%

2. **Deduplication**
   - [ ] Duplicate claims detected with >90% accuracy
   - [ ] False positive rate <5%
   - [ ] Stance data correctly merged

3. **Performance**
   - [ ] Batch embedding processes 100 claims in <10s
   - [ ] Similarity search returns in <100ms
   - [ ] Backfill command handles 10k+ claims

4. **CLI Commands**
   - [ ] `bun run embeddings:backfill` works
   - [ ] `bun run embeddings:detect-duplicates` works
   - [ ] `bun run embeddings:stats` shows correct counts

---

## Future Enhancements

- Persistent embedding cache in SurrealDB
- Embedding model comparison tool
- Automatic re-embedding when model changes
- Claim canonicalization UI in explorer
