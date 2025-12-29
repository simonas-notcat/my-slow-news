# Feature 2: Natural Language Claim Search

## Overview

Enable users to search claims using natural language queries instead of exact keyword matching. This allows conceptual questions like "what do people think about memory safety?" to find relevant claims regardless of exact phrasing.

### Problem Statement

The current explorer search requires exact or partial text matching on the `subject` field. Users cannot:
- Search by concept ("memory safety", "performance optimization")
- Find claims with different phrasing of the same idea
- Ask natural questions about the knowledge base

**Current limitations:**
```
bun run query -s "Rust"        # Only finds claims with "Rust" in subject
bun run query -s "memory"      # Misses "Rust is-safer-than C++" even though it's about memory safety
```

### Solution

1. Embed user search queries using the same embedding infrastructure as claims
2. Perform vector similarity search against claim embeddings
3. Rank results by semantic relevance
4. Integrate into CLI explorer as a new search mode

**Value:** More intuitive discovery, finds relevant claims regardless of phrasing.

---

## Implementation Plan

### Step 1: Semantic Search Service

Create a dedicated service for semantic search operations.

#### 1.1 Search Service Interface

**File:** `src/embeddings/search.ts`

```typescript
import type Surreal from 'surrealdb';
import type { ClaimRecord } from '../types';
import type { EmbeddingService } from './index';

export interface SemanticSearchOptions {
  limit?: number;
  minSimilarity?: number;
  includeCanonicalOnly?: boolean;
  filters?: {
    predicate?: string;
    days?: number;
  };
}

export interface SemanticSearchResult {
  claim: ClaimRecord;
  similarity: number;
  matchReason?: string;  // Optional explanation of why this matched
}

export class SemanticSearchService {
  constructor(
    private db: Surreal,
    private embeddings: EmbeddingService
  ) {}

  /**
   * Search claims semantically using natural language query.
   */
  async search(
    query: string,
    options: SemanticSearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    const {
      limit = 20,
      minSimilarity = 0.5,
      includeCanonicalOnly = true,
      filters = {},
    } = options;

    // Embed the search query
    const { embedding } = await this.embeddings.embed(query);

    // Build filter conditions
    const conditions: string[] = ['embedding IS NOT NONE'];
    const params: Record<string, unknown> = {
      embedding,
      limit,
      minSimilarity,
    };

    if (includeCanonicalOnly) {
      conditions.push('is_canonical = true');
    }

    if (filters.predicate) {
      conditions.push('predicate = $predicate');
      params.predicate = filters.predicate;
    }

    if (filters.days) {
      conditions.push('extracted_at >= $cutoff');
      params.cutoff = new Date(
        Date.now() - filters.days * 24 * 60 * 60 * 1000
      ).toISOString();
    }

    const whereClause = conditions.join(' AND ');

    // Perform vector similarity search
    const query = `
      SELECT
        *,
        vector::similarity::cosine(embedding, $embedding) AS similarity
      FROM claim
      WHERE ${whereClause}
        AND vector::similarity::cosine(embedding, $embedding) >= $minSimilarity
      ORDER BY similarity DESC
      LIMIT $limit
    `;

    const [results] = await this.db.query<[SemanticSearchResult[]]>(
      query,
      params
    );

    return results || [];
  }

  /**
   * Search with query expansion - also searches for related concepts.
   * Uses the LLM to generate related terms for broader coverage.
   */
  async searchExpanded(
    query: string,
    options: SemanticSearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    // For now, just do a simple search
    // Future: Use LLM to expand query with related terms
    return this.search(query, options);
  }

  /**
   * Get search suggestions based on partial input.
   * Useful for autocomplete functionality.
   */
  async getSuggestions(
    partialQuery: string,
    limit: number = 5
  ): Promise<string[]> {
    // Search for claims that match the partial query
    const results = await this.search(partialQuery, {
      limit,
      minSimilarity: 0.4,
    });

    // Extract unique subjects as suggestions
    const subjects = new Set<string>();
    for (const result of results) {
      subjects.add(result.claim.subject);
      if (subjects.size >= limit) break;
    }

    return Array.from(subjects);
  }
}
```

---

### Step 2: Explorer Integration

Add semantic search to the CLI explorer.

#### 2.1 Update FilterState Type

**File:** `src/cli/explorer/types.ts` (additions)

```typescript
export interface FilterState {
  predicate: string | null;
  subject: string | null;
  days: number | null;
  stanceFilter: "all" | "unrated" | "rated" | "agrees" | "disagrees" | "neutral" | "uncertain";
  // NEW: Semantic search query
  semanticQuery: string | null;
  // NEW: Search mode toggle
  searchMode: "keyword" | "semantic";
}
```

#### 2.2 Add Semantic Search Query Builder

**File:** `src/cli/explorer/utils/queries.ts` (additions)

```typescript
import { SemanticSearchService, type SemanticSearchResult } from '../../../embeddings/search';
import { getEmbeddingService, type EmbeddingConfig } from '../../../embeddings';
import type Surreal from 'surrealdb';

/**
 * Perform semantic search when in semantic mode.
 * Returns claim IDs sorted by relevance.
 */
export async function performSemanticSearch(
  db: Surreal,
  query: string,
  filters: Partial<FilterState>,
  config: EmbeddingConfig
): Promise<SemanticSearchResult[]> {
  const embeddingService = getEmbeddingService(config);
  const searchService = new SemanticSearchService(db, embeddingService);

  return searchService.search(query, {
    limit: 50,  // Fetch more, paginate in UI
    minSimilarity: 0.5,
    filters: {
      predicate: filters.predicate ?? undefined,
      days: filters.days ?? undefined,
    },
  });
}

/**
 * Build query that fetches claims by ID list (for semantic search results).
 */
export function buildClaimsByIdsQuery(
  claimIds: string[],
  limit: number,
  offset: number
): QueryResult {
  // Preserve order from semantic search (by relevance)
  const idsToFetch = claimIds.slice(offset, offset + limit);

  const sql = `
    SELECT
      id,
      subject,
      predicate,
      object,
      confidence,
      extracted_at,
      (SELECT user_stance FROM claim_stances WHERE claim = $parent.id LIMIT 1)[0].user_stance AS user_stance
    FROM claim
    WHERE id IN $ids
  `;

  return { sql, params: { ids: idsToFetch } };
}
```

#### 2.3 Create Semantic Search Input Component

**File:** `src/cli/explorer/components/SemanticSearchInput.tsx`

```tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';

interface SemanticSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isSearching: boolean;
  resultCount?: number;
}

export function SemanticSearchInput({
  value,
  onChange,
  onSubmit,
  isSearching,
  resultCount,
}: SemanticSearchInputProps) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan">Search: </Text>
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder="Ask a question about your claims..."
        />
        {isSearching && (
          <Box marginLeft={1}>
            <Spinner type="dots" />
          </Box>
        )}
      </Box>
      {resultCount !== undefined && !isSearching && (
        <Text dimColor>
          {resultCount} relevant claims found
        </Text>
      )}
    </Box>
  );
}
```

#### 2.4 Update Header Component

**File:** `src/cli/explorer/components/Header.tsx` (modifications)

Add a search mode indicator and toggle:

```tsx
// In the Header component, add:
<Box marginLeft={2}>
  <Text dimColor>Mode: </Text>
  <Text color={searchMode === 'semantic' ? 'green' : 'gray'}>
    {searchMode === 'semantic' ? '🔍 Semantic' : '📝 Keyword'}
  </Text>
  <Text dimColor> (Tab to toggle)</Text>
</Box>
```

#### 2.5 Update App Context

**File:** `src/cli/explorer/context/AppContext.tsx` (modifications)

Add semantic search state:

```typescript
interface AppState {
  // ... existing state
  semanticQuery: string;
  searchMode: 'keyword' | 'semantic';
  semanticResults: SemanticSearchResult[] | null;
  isSearching: boolean;
}

// Add actions:
type Action =
  | { type: 'SET_SEMANTIC_QUERY'; payload: string }
  | { type: 'TOGGLE_SEARCH_MODE' }
  | { type: 'SET_SEMANTIC_RESULTS'; payload: SemanticSearchResult[] }
  | { type: 'SET_SEARCHING'; payload: boolean }
  // ... existing actions
```

#### 2.6 Add Keyboard Shortcut

**File:** `src/cli/explorer/hooks/useKeyboard.ts` (modifications)

```typescript
// Add Tab key handler to toggle search mode:
case 'tab':
  dispatch({ type: 'TOGGLE_SEARCH_MODE' });
  break;

// Add / key to focus search:
case '/':
  if (state.screen === 'list') {
    dispatch({ type: 'FOCUS_SEARCH' });
  }
  break;
```

---

### Step 3: Search Results Display

#### 3.1 Update ClaimsList to Show Relevance

**File:** `src/cli/explorer/components/ClaimItem.tsx` (modifications)

```tsx
interface ClaimItemProps {
  claim: ClaimListItem;
  isSelected: boolean;
  similarity?: number;  // NEW: relevance score for semantic search
}

export function ClaimItem({ claim, isSelected, similarity }: ClaimItemProps) {
  return (
    <Box>
      {/* Existing claim display */}

      {/* Show relevance score when in semantic search mode */}
      {similarity !== undefined && (
        <Box marginLeft={1}>
          <Text color="cyan">
            {Math.round(similarity * 100)}% match
          </Text>
        </Box>
      )}
    </Box>
  );
}
```

#### 3.2 Add "No Semantic Results" Empty State

**File:** `src/cli/explorer/components/EmptyState.tsx` (additions)

```tsx
// Add new empty state type:
case 'no-semantic-results':
  return (
    <Box flexDirection="column" alignItems="center" padding={2}>
      <Text color="yellow">No claims match your search</Text>
      <Text dimColor>Try a different phrasing or broader terms</Text>
      <Box marginTop={1}>
        <Text dimColor>Examples:</Text>
      </Box>
      <Text dimColor>  • "performance comparisons"</Text>
      <Text dimColor>  • "what languages are safer"</Text>
      <Text dimColor>  • "new releases and announcements"</Text>
    </Box>
  );
```

---

### Step 4: CLI Flag Support

#### 4.1 Update CLI Entry Point

**File:** `src/cli/explorer/index.tsx` (modifications)

```typescript
program
  .option('-s, --subject <subject>', 'Filter by subject (keyword mode)')
  .option('-q, --query <query>', 'Semantic search query')  // NEW
  .option('-p, --predicate <predicate>', 'Filter by predicate')
  .option('-d, --days <days>', 'Filter by days', parseInt)
```

When `--query` is provided, start in semantic search mode:

```typescript
const initialFilters: FilterState = {
  // ... existing
  semanticQuery: options.query || null,
  searchMode: options.query ? 'semantic' : 'keyword',
};
```

---

### Step 5: Configuration

#### 5.1 Add Search Configuration

**File:** `src/types/index.ts` (additions to semantic config)

```typescript
semantic: z.object({
  deduplication: z.object({...}).optional().default({}),
  // NEW: Search configuration
  search: z.object({
    enabled: z.boolean().default(true),
    min_similarity: z.number().default(0.5),
    max_results: z.number().default(50),
    // Show similarity scores in results
    show_scores: z.boolean().default(true),
  }).optional().default({}),
}).optional().default({}),
```

#### 5.2 Example Config

```yaml
semantic:
  deduplication:
    enabled: true
    similarity_threshold: 0.92
  search:
    enabled: true
    min_similarity: 0.5
    max_results: 50
    show_scores: true
```

---

### Step 6: Testing

#### 6.1 Search Service Tests

**File:** `src/embeddings/search.test.ts`

```typescript
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { SemanticSearchService } from './search';
import type { EmbeddingService } from './index';
import type Surreal from 'surrealdb';

describe('SemanticSearchService', () => {
  const mockEmbeddingService = {
    name: 'test',
    dimensions: 4,
    embed: mock(() => Promise.resolve({
      text: 'test query',
      embedding: [0.1, 0.2, 0.3, 0.4],
      model: 'test',
      cached: false,
    })),
  } as unknown as EmbeddingService;

  const mockDb = {
    query: mock(() => Promise.resolve([[]])),
  } as unknown as Surreal;

  let service: SemanticSearchService;

  beforeEach(() => {
    (mockDb.query as ReturnType<typeof mock>).mockClear();
    (mockEmbeddingService.embed as ReturnType<typeof mock>).mockClear();
    service = new SemanticSearchService(mockDb, mockEmbeddingService);
  });

  describe('search', () => {
    test('embeds query and searches database', async () => {
      const mockResults = [
        { claim: { id: 'claim:1', subject: 'Rust' }, similarity: 0.9 },
        { claim: { id: 'claim:2', subject: 'Go' }, similarity: 0.8 },
      ];
      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([mockResults]));

      const results = await service.search('memory safety');

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith('memory safety');
      expect(results).toHaveLength(2);
      expect(results[0].similarity).toBe(0.9);
    });

    test('applies predicate filter', async () => {
      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[]]));

      await service.search('test', { filters: { predicate: 'is-safer-than' } });

      const queryCall = (mockDb.query as ReturnType<typeof mock>).mock.calls[0];
      expect(queryCall[0]).toContain('predicate = $predicate');
      expect(queryCall[1].predicate).toBe('is-safer-than');
    });

    test('applies days filter', async () => {
      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[]]));

      await service.search('test', { filters: { days: 7 } });

      const queryCall = (mockDb.query as ReturnType<typeof mock>).mock.calls[0];
      expect(queryCall[0]).toContain('extracted_at >= $cutoff');
    });

    test('respects minimum similarity threshold', async () => {
      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[]]));

      await service.search('test', { minSimilarity: 0.7 });

      const queryCall = (mockDb.query as ReturnType<typeof mock>).mock.calls[0];
      expect(queryCall[1].minSimilarity).toBe(0.7);
    });
  });

  describe('getSuggestions', () => {
    test('returns unique subjects from search results', async () => {
      const mockResults = [
        { claim: { id: 'claim:1', subject: 'Rust' }, similarity: 0.9 },
        { claim: { id: 'claim:2', subject: 'Rust' }, similarity: 0.85 },
        { claim: { id: 'claim:3', subject: 'Go' }, similarity: 0.8 },
      ];
      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([mockResults]));

      const suggestions = await service.getSuggestions('programming');

      expect(suggestions).toEqual(['Rust', 'Go']);
    });
  });
});
```

---

## File Summary

| File | Purpose | Status |
|------|---------|--------|
| `src/embeddings/search.ts` | Semantic search service | New |
| `src/embeddings/search.test.ts` | Search service tests | New |
| `src/cli/explorer/types.ts` | Add search mode types | Modify |
| `src/cli/explorer/utils/queries.ts` | Add semantic query helpers | Modify |
| `src/cli/explorer/components/SemanticSearchInput.tsx` | Search input component | New |
| `src/cli/explorer/components/Header.tsx` | Show search mode | Modify |
| `src/cli/explorer/components/ClaimItem.tsx` | Show similarity scores | Modify |
| `src/cli/explorer/components/EmptyState.tsx` | Add semantic empty state | Modify |
| `src/cli/explorer/context/AppContext.tsx` | Add search state | Modify |
| `src/cli/explorer/hooks/useKeyboard.ts` | Add Tab/search shortcuts | Modify |
| `src/cli/explorer/index.tsx` | Add --query flag | Modify |
| `src/types/index.ts` | Add search config schema | Modify |

---

## Success Criteria

1. **Search Quality**
   - [ ] Relevant results in top 5 for >80% of queries
   - [ ] Conceptual queries ("memory safety") find related claims
   - [ ] Results ranked by semantic relevance

2. **User Experience**
   - [ ] Tab toggles between keyword/semantic mode
   - [ ] / focuses search input
   - [ ] Clear indication of search mode
   - [ ] Similarity scores displayed for transparency

3. **Performance**
   - [ ] Search results return in <500ms
   - [ ] No lag when typing search query
   - [ ] Efficient pagination of results

4. **Integration**
   - [ ] Works with existing filters (predicate, days)
   - [ ] `--query` CLI flag works
   - [ ] Graceful fallback if embeddings unavailable

---

## User Experience Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  My Slow News Explorer                     Mode: 🔍 Semantic    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Search: what do people think about memory safety?              │
│  ───────────────────────────────────────────────────           │
│  12 relevant claims found                                       │
│                                                                 │
│  ▸ Rust is-safer-than C++                           95% match   │
│    └ Confidence: 0.9 │ Stance: agrees                          │
│                                                                 │
│    C++ has memory-bugs Rust lacks                   92% match   │
│    └ Confidence: 0.85 │ Stance: agrees                         │
│                                                                 │
│    Rust prevents memory-safety-issues               88% match   │
│    └ Confidence: 0.8 │ Stance: neutral                         │
│                                                                 │
│    Go uses garbage-collection for memory-safety    75% match   │
│    └ Confidence: 0.7 │ Stance: neutral                         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ↑↓ Navigate  Enter View  Tab Mode  / Search  q Quit           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Future Enhancements

- **Query expansion**: Use LLM to generate related search terms
- **Search history**: Remember recent searches
- **Saved searches**: Bookmark frequent queries
- **Fuzzy matching**: Combine semantic + keyword for best of both
- **Search analytics**: Track what users search for
