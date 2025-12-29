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

/** Input validation constraints */
const VALIDATION = {
  MIN_QUERY_LENGTH: 2,
  MAX_QUERY_LENGTH: 500,
  MAX_PREDICATE_LENGTH: 100,
  MAX_RESULTS_LIMIT: 100,
} as const;

/** Rate limiting: max requests per minute */
const RATE_LIMIT = {
  MAX_REQUESTS_PER_MINUTE: 30,
  WINDOW_MS: 60_000,
} as const;

export class SemanticSearchService {
  private requestTimestamps: number[] = [];

  constructor(
    private db: Surreal,
    private embeddings: EmbeddingService
  ) {}

  /**
   * Check rate limit before making API call.
   * Throws if rate limit exceeded.
   */
  private checkRateLimit(): void {
    const now = Date.now();
    // Remove timestamps outside the window
    this.requestTimestamps = this.requestTimestamps.filter(
      ts => now - ts < RATE_LIMIT.WINDOW_MS
    );

    if (this.requestTimestamps.length >= RATE_LIMIT.MAX_REQUESTS_PER_MINUTE) {
      const oldestTs = this.requestTimestamps[0];
      const waitMs = RATE_LIMIT.WINDOW_MS - (now - oldestTs);
      throw new Error(
        `Rate limit exceeded. Please wait ${Math.ceil(waitMs / 1000)}s before searching again.`
      );
    }

    this.requestTimestamps.push(now);
  }

  /**
   * Validate search input.
   * Throws descriptive error if validation fails.
   */
  private validateInput(
    query: string,
    options: SemanticSearchOptions
  ): void {
    // Validate query
    if (!query || query.trim().length < VALIDATION.MIN_QUERY_LENGTH) {
      throw new Error(
        `Search query must be at least ${VALIDATION.MIN_QUERY_LENGTH} characters`
      );
    }
    if (query.length > VALIDATION.MAX_QUERY_LENGTH) {
      throw new Error(
        `Search query must be at most ${VALIDATION.MAX_QUERY_LENGTH} characters`
      );
    }

    // Validate predicate filter
    if (options.filters?.predicate) {
      if (options.filters.predicate.length > VALIDATION.MAX_PREDICATE_LENGTH) {
        throw new Error(
          `Predicate filter must be at most ${VALIDATION.MAX_PREDICATE_LENGTH} characters`
        );
      }
    }

    // Validate limit
    if (options.limit !== undefined) {
      if (options.limit < 1 || options.limit > VALIDATION.MAX_RESULTS_LIMIT) {
        throw new Error(
          `Limit must be between 1 and ${VALIDATION.MAX_RESULTS_LIMIT}`
        );
      }
    }

    // Validate days filter
    if (options.filters?.days !== undefined) {
      if (options.filters.days < 1 || options.filters.days > 365) {
        throw new Error('Days filter must be between 1 and 365');
      }
    }
  }

  /**
   * Search claims semantically using natural language query.
   */
  async search(
    query: string,
    options: SemanticSearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    // Validate input before processing
    this.validateInput(query, options);

    // Check rate limit before making API calls
    this.checkRateLimit();

    const {
      limit = 20,
      minSimilarity = 0.5,
      includeCanonicalOnly = true,
      filters = {},
    } = options;

    // Embed the search query
    const { embedding } = await this.embeddings.embed(query.trim());

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
    // Note: Using sqlQuery to avoid shadowing the query parameter
    const sqlQuery = `
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
      sqlQuery,
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
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';

/** Debounce delay in milliseconds */
const DEBOUNCE_MS = 500;

interface SemanticSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;  // Debounced search trigger
  isSearching: boolean;
  resultCount?: number;
  error?: string;
}

/**
 * Custom hook for debouncing a value.
 */
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function SemanticSearchInput({
  value,
  onChange,
  onSearch,
  isSearching,
  resultCount,
  error,
}: SemanticSearchInputProps) {
  // Debounce the search query
  const debouncedQuery = useDebounce(value, DEBOUNCE_MS);
  const prevDebouncedRef = useRef(debouncedQuery);

  // Trigger search when debounced value changes
  useEffect(() => {
    if (debouncedQuery !== prevDebouncedRef.current) {
      prevDebouncedRef.current = debouncedQuery;
      if (debouncedQuery.trim().length >= 2) {
        onSearch(debouncedQuery);
      }
    }
  }, [debouncedQuery, onSearch]);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="cyan">Search: </Text>
        <TextInput
          value={value}
          onChange={onChange}
          placeholder="Ask a question about your claims..."
        />
        {isSearching && (
          <Box marginLeft={1}>
            <Spinner type="dots" />
          </Box>
        )}
      </Box>

      {/* Error display */}
      {error && (
        <Text color="red">{error}</Text>
      )}

      {/* Result count */}
      {resultCount !== undefined && !isSearching && !error && (
        <Text dimColor>
          {resultCount} relevant claims found
        </Text>
      )}

      {/* Hint for minimum query length */}
      {value.length > 0 && value.length < 2 && (
        <Text dimColor>Type at least 2 characters to search</Text>
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

  describe('input validation', () => {
    test('rejects empty query', async () => {
      await expect(service.search('')).rejects.toThrow('at least 2 characters');
    });

    test('rejects whitespace-only query', async () => {
      await expect(service.search('   ')).rejects.toThrow('at least 2 characters');
    });

    test('rejects query exceeding max length', async () => {
      const longQuery = 'a'.repeat(501);
      await expect(service.search(longQuery)).rejects.toThrow('at most 500 characters');
    });

    test('rejects invalid days filter', async () => {
      await expect(service.search('test', { filters: { days: 0 } }))
        .rejects.toThrow('between 1 and 365');

      await expect(service.search('test', { filters: { days: 400 } }))
        .rejects.toThrow('between 1 and 365');
    });

    test('rejects invalid limit', async () => {
      await expect(service.search('test', { limit: 0 }))
        .rejects.toThrow('between 1 and');

      await expect(service.search('test', { limit: 200 }))
        .rejects.toThrow('between 1 and');
    });
  });

  describe('rate limiting', () => {
    test('allows requests within limit', async () => {
      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementation(() => Promise.resolve([[]]));

      // Should not throw for reasonable number of requests
      for (let i = 0; i < 5; i++) {
        await service.search('test query');
      }
    });

    test('throws when rate limit exceeded', async () => {
      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementation(() => Promise.resolve([[]]));

      // Exhaust rate limit
      for (let i = 0; i < 30; i++) {
        await service.search('test query');
      }

      // Next request should fail
      await expect(service.search('test query'))
        .rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('error handling', () => {
    test('handles embedding service failure', async () => {
      (mockEmbeddingService.embed as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.reject(new Error('Embedding API error')));

      await expect(service.search('test query'))
        .rejects.toThrow('Embedding API error');
    });

    test('handles database query failure', async () => {
      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.reject(new Error('Database error')));

      await expect(service.search('test query'))
        .rejects.toThrow('Database error');
    });
  });
});
```

#### 6.2 SemanticSearchInput Component Tests

**File:** `src/cli/explorer/components/SemanticSearchInput.test.tsx`

```tsx
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import React from 'react';
import { render } from 'ink-testing-library';
import { SemanticSearchInput } from './SemanticSearchInput';

describe('SemanticSearchInput', () => {
  const defaultProps = {
    value: '',
    onChange: mock(() => {}),
    onSearch: mock(() => {}),
    isSearching: false,
  };

  beforeEach(() => {
    (defaultProps.onChange as ReturnType<typeof mock>).mockClear();
    (defaultProps.onSearch as ReturnType<typeof mock>).mockClear();
  });

  test('renders search input', () => {
    const { lastFrame } = render(<SemanticSearchInput {...defaultProps} />);
    expect(lastFrame()).toContain('Search:');
  });

  test('shows spinner when searching', () => {
    const { lastFrame } = render(
      <SemanticSearchInput {...defaultProps} isSearching={true} />
    );
    expect(lastFrame()).toContain('⠋'); // Spinner character
  });

  test('shows result count when available', () => {
    const { lastFrame } = render(
      <SemanticSearchInput {...defaultProps} resultCount={42} />
    );
    expect(lastFrame()).toContain('42 relevant claims found');
  });

  test('shows error message', () => {
    const { lastFrame } = render(
      <SemanticSearchInput {...defaultProps} error="Search failed" />
    );
    expect(lastFrame()).toContain('Search failed');
  });

  test('shows hint for short queries', () => {
    const { lastFrame } = render(
      <SemanticSearchInput {...defaultProps} value="a" />
    );
    expect(lastFrame()).toContain('at least 2 characters');
  });

  test('does not show hint for valid query length', () => {
    const { lastFrame } = render(
      <SemanticSearchInput {...defaultProps} value="test" />
    );
    expect(lastFrame()).not.toContain('at least 2 characters');
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
| `src/cli/explorer/components/SemanticSearchInput.test.tsx` | Search input tests | New |
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
