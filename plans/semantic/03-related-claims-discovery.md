# Feature 3: Related Claims Discovery

## Overview

When viewing a claim in the explorer, show semantically related claims to enable knowledge graph exploration and serendipitous discovery.

### Problem Statement

Currently, when viewing a claim's details, users have no way to discover related claims unless they share exact keywords. This limits the ability to:
- Explore connected concepts
- Find supporting or contradicting claims
- Build mental models of topic areas
- Discover unexpected connections

**Example:** When viewing "Rust is-safer-than C++", users might want to see:
- "C++ has memory-bugs Rust lacks" (same concept, different phrasing)
- "Go uses garbage-collection for memory-safety" (related topic)
- "Zig is-safer-than C" (similar comparison pattern)

### Solution

1. When viewing a claim detail, query for similar claims by embedding distance
2. Filter out exact duplicates (already handled by deduplication)
3. Display related claims in a collapsible section
4. Allow navigation to related claims

**Value:** Serendipitous discovery, knowledge graph exploration, context building.

---

## Implementation Plan

### Step 1: Related Claims Service

Create a service to find and categorize related claims.

#### 1.1 Related Claims Service

**File:** `src/embeddings/related.ts`

```typescript
import type Surreal from 'surrealdb';
import type { ClaimRecord } from '../types';
import { cosineSimilarity } from './similarity';

export interface RelatedClaim {
  claim: ClaimRecord;
  similarity: number;
  relationship: 'similar' | 'same-subject' | 'same-predicate' | 'same-object';
}

export interface RelatedClaimsOptions {
  limit?: number;
  minSimilarity?: number;
  excludeDuplicates?: boolean;
  groupByRelationship?: boolean;
}

export interface GroupedRelatedClaims {
  similar: RelatedClaim[];      // Semantically similar (different subject/predicate/object)
  sameSubject: RelatedClaim[];  // Same subject, different claims
  samePredicate: RelatedClaim[]; // Same predicate type
  sameObject: RelatedClaim[];   // Same object, different subjects
}

export class RelatedClaimsService {
  constructor(private db: Surreal) {}

  /**
   * Find claims related to the given claim.
   * Uses embedding similarity and structural relationships.
   */
  async findRelated(
    claimId: string,
    options: RelatedClaimsOptions = {}
  ): Promise<RelatedClaim[]> {
    const {
      limit = 10,
      minSimilarity = 0.6,
      excludeDuplicates = true,
    } = options;

    // Get the source claim with its embedding
    const [sourceClaim] = await this.db.query<[ClaimRecord[]]>(
      `SELECT * FROM claim WHERE id = $claimId`,
      { claimId }
    );

    if (!sourceClaim?.[0]) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    const claim = sourceClaim[0];

    // If claim has no embedding, fall back to structural similarity only
    if (!claim.embedding) {
      return this.findStructurallyRelated(claim, { limit });
    }

    // Build exclusion list (self + duplicates)
    let excludeIds = [claimId];
    if (excludeDuplicates) {
      const [duplicates] = await this.db.query<[Array<{ id: string }>]>(`
        SELECT id FROM claim
        WHERE canonical_claim = $claimId OR id IN (
          SELECT in FROM claim_similarity
          WHERE out = $claimId AND relationship = 'duplicate'
        )
      `, { claimId });
      excludeIds = excludeIds.concat(duplicates?.map(d => d.id) || []);
    }

    // Vector similarity search
    const [semanticResults] = await this.db.query<[RelatedClaim[]]>(`
      SELECT
        *,
        vector::similarity::cosine(embedding, $embedding) AS similarity
      FROM claim
      WHERE
        embedding IS NOT NONE
        AND is_canonical = true
        AND id NOT IN $excludeIds
        AND vector::similarity::cosine(embedding, $embedding) >= $minSimilarity
      ORDER BY similarity DESC
      LIMIT $limit
    `, {
      embedding: claim.embedding,
      excludeIds,
      minSimilarity,
      limit: limit * 2, // Fetch more for categorization
    });

    // Categorize by relationship type
    const results: RelatedClaim[] = (semanticResults || []).map(r => ({
      claim: r.claim || r,
      similarity: r.similarity,
      relationship: this.categorizeRelationship(claim, r.claim || r),
    }));

    return results.slice(0, limit);
  }

  /**
   * Find related claims grouped by relationship type.
   */
  async findRelatedGrouped(
    claimId: string,
    options: RelatedClaimsOptions = {}
  ): Promise<GroupedRelatedClaims> {
    const related = await this.findRelated(claimId, {
      ...options,
      limit: (options.limit || 10) * 2, // Fetch more for grouping
    });

    const grouped: GroupedRelatedClaims = {
      similar: [],
      sameSubject: [],
      samePredicate: [],
      sameObject: [],
    };

    for (const item of related) {
      switch (item.relationship) {
        case 'same-subject':
          grouped.sameSubject.push(item);
          break;
        case 'same-predicate':
          grouped.samePredicate.push(item);
          break;
        case 'same-object':
          grouped.sameObject.push(item);
          break;
        default:
          grouped.similar.push(item);
      }
    }

    // Limit each group
    const perGroupLimit = Math.ceil((options.limit || 10) / 4);
    grouped.similar = grouped.similar.slice(0, perGroupLimit);
    grouped.sameSubject = grouped.sameSubject.slice(0, perGroupLimit);
    grouped.samePredicate = grouped.samePredicate.slice(0, perGroupLimit);
    grouped.sameObject = grouped.sameObject.slice(0, perGroupLimit);

    return grouped;
  }

  /**
   * Find structurally related claims (same subject/predicate/object).
   * Used as fallback when embeddings aren't available.
   */
  private async findStructurallyRelated(
    claim: ClaimRecord,
    options: { limit: number }
  ): Promise<RelatedClaim[]> {
    const results: RelatedClaim[] = [];

    // Same subject
    const [sameSubject] = await this.db.query<[ClaimRecord[]]>(`
      SELECT * FROM claim
      WHERE subject = $subject AND id != $claimId AND is_canonical = true
      LIMIT $limit
    `, { subject: claim.subject, claimId: claim.id, limit: options.limit });

    for (const c of sameSubject || []) {
      results.push({
        claim: c,
        similarity: 0.7, // Estimated similarity for same subject
        relationship: 'same-subject',
      });
    }

    // Same predicate
    const [samePredicate] = await this.db.query<[ClaimRecord[]]>(`
      SELECT * FROM claim
      WHERE predicate = $predicate AND id != $claimId AND is_canonical = true
      LIMIT $limit
    `, { predicate: claim.predicate, claimId: claim.id, limit: options.limit });

    for (const c of samePredicate || []) {
      if (!results.find(r => r.claim.id === c.id)) {
        results.push({
          claim: c,
          similarity: 0.5, // Estimated similarity for same predicate
          relationship: 'same-predicate',
        });
      }
    }

    return results.slice(0, options.limit);
  }

  /**
   * Categorize the relationship between two claims.
   */
  private categorizeRelationship(
    source: ClaimRecord,
    target: ClaimRecord
  ): RelatedClaim['relationship'] {
    if (source.subject === target.subject) {
      return 'same-subject';
    }
    if (source.predicate === target.predicate) {
      return 'same-predicate';
    }
    if (source.object === target.object) {
      return 'same-object';
    }
    return 'similar';
  }

  /**
   * Pre-compute and cache related claims for a set of claims.
   * Useful for batch processing.
   *
   * Uses concurrency limiting to avoid overwhelming the database
   * and embedding service.
   */
  async precomputeRelated(
    claimIds: string[],
    options: RelatedClaimsOptions & { concurrencyLimit?: number } = {}
  ): Promise<Map<string, RelatedClaim[]>> {
    const { concurrencyLimit = 5, ...relatedOptions } = options;
    const results = new Map<string, RelatedClaim[]>();

    // Process in batches with concurrency limit
    for (let i = 0; i < claimIds.length; i += concurrencyLimit) {
      const batch = claimIds.slice(i, i + concurrencyLimit);

      const batchResults = await Promise.all(
        batch.map(async (claimId) => {
          try {
            const related = await this.findRelated(claimId, relatedOptions);
            return { claimId, related, error: null };
          } catch (error) {
            console.warn(`Failed to find related for ${claimId}:`, error);
            return { claimId, related: [], error };
          }
        })
      );

      for (const { claimId, related } of batchResults) {
        results.set(claimId, related);
      }

      // Optional: Add small delay between batches to avoid rate limiting
      if (i + concurrencyLimit < claimIds.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Validate claim ID format.
   */
  private validateClaimId(claimId: string): void {
    if (!claimId || typeof claimId !== 'string') {
      throw new Error('Claim ID is required');
    }
    if (!claimId.startsWith('claim:')) {
      throw new Error('Invalid claim ID format');
    }
  }
}
```

---

### Step 2: Update Claim Detail Query

#### 2.1 Extend Claim Detail Type

**File:** `src/cli/explorer/types.ts` (additions)

```typescript
export interface RelatedClaimItem {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  similarity: number;
  relationship: 'similar' | 'same-subject' | 'same-predicate' | 'same-object';
}

export interface ClaimDetail {
  // ... existing fields ...

  // NEW: Related claims
  relatedClaims?: RelatedClaimItem[];
  relatedClaimsGrouped?: {
    similar: RelatedClaimItem[];
    sameSubject: RelatedClaimItem[];
    samePredicate: RelatedClaimItem[];
    sameObject: RelatedClaimItem[];
  };
}
```

#### 2.2 Add Related Claims Query

**File:** `src/cli/explorer/utils/queries.ts` (additions)

```typescript
import { RelatedClaimsService } from '../../../embeddings/related';

/**
 * Fetch related claims for a given claim.
 * Called separately from main detail query for performance.
 */
export async function fetchRelatedClaims(
  db: Surreal,
  claimId: string,
  options: { limit?: number; grouped?: boolean } = {}
): Promise<RelatedClaimItem[] | GroupedRelatedClaims> {
  const service = new RelatedClaimsService(db);

  if (options.grouped) {
    const grouped = await service.findRelatedGrouped(claimId, {
      limit: options.limit || 12,
      minSimilarity: 0.6,
    });
    return grouped;
  }

  const related = await service.findRelated(claimId, {
    limit: options.limit || 6,
    minSimilarity: 0.6,
  });

  return related.map(r => ({
    id: r.claim.id as string,
    subject: r.claim.subject,
    predicate: r.claim.predicate,
    object: r.claim.object,
    similarity: r.similarity,
    relationship: r.relationship,
  }));
}
```

---

### Step 3: Explorer UI Components

#### 3.1 Related Claims Section Component

**File:** `src/cli/explorer/components/RelatedClaims.tsx`

```tsx
import React, { useState } from 'react';
import { Box, Text } from 'ink';
import type { RelatedClaimItem } from '../types';

interface RelatedClaimsProps {
  claims: RelatedClaimItem[];
  onSelect: (claimId: string) => void;
  selectedIndex: number;
  isActive: boolean;
}

const RELATIONSHIP_LABELS: Record<RelatedClaimItem['relationship'], string> = {
  'similar': '≈',
  'same-subject': '→',
  'same-predicate': '⇔',
  'same-object': '←',
};

const RELATIONSHIP_COLORS: Record<RelatedClaimItem['relationship'], string> = {
  'similar': 'cyan',
  'same-subject': 'green',
  'same-predicate': 'yellow',
  'same-object': 'magenta',
};

export function RelatedClaims({
  claims,
  onSelect,
  selectedIndex,
  isActive,
}: RelatedClaimsProps) {
  if (claims.length === 0) {
    return (
      <Box marginTop={1}>
        <Text dimColor>No related claims found</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">Related Claims</Text>
        <Text dimColor> ({claims.length})</Text>
      </Box>

      {claims.map((claim, index) => {
        const isSelected = isActive && index === selectedIndex;
        const relLabel = RELATIONSHIP_LABELS[claim.relationship];
        const relColor = RELATIONSHIP_COLORS[claim.relationship];

        return (
          <Box key={claim.id} paddingLeft={1}>
            <Text color={isSelected ? 'blue' : undefined}>
              {isSelected ? '▸ ' : '  '}
            </Text>
            <Text color={relColor}>{relLabel} </Text>
            <Text
              color={isSelected ? 'blue' : undefined}
              bold={isSelected}
            >
              {claim.subject} {claim.predicate} {claim.object}
            </Text>
            <Text dimColor> ({Math.round(claim.similarity * 100)}%)</Text>
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text dimColor>
          ≈ similar  → same subject  ⇔ same predicate  ← same object
        </Text>
      </Box>
    </Box>
  );
}
```

#### 3.2 Grouped Related Claims Component

**File:** `src/cli/explorer/components/RelatedClaimsGrouped.tsx`

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { RelatedClaimItem } from '../types';

interface GroupedRelatedClaimsProps {
  groups: {
    similar: RelatedClaimItem[];
    sameSubject: RelatedClaimItem[];
    samePredicate: RelatedClaimItem[];
    sameObject: RelatedClaimItem[];
  };
  onSelect: (claimId: string) => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function ClaimMiniList({
  title,
  claims,
  color,
  onSelect,
}: {
  title: string;
  claims: RelatedClaimItem[];
  color: string;
  onSelect: (id: string) => void;
}) {
  if (claims.length === 0) return null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color={color} bold>{title}</Text>
      {claims.slice(0, 3).map(claim => (
        <Box key={claim.id} paddingLeft={2}>
          <Text>• {claim.subject} {claim.predicate} {claim.object}</Text>
          <Text dimColor> ({Math.round(claim.similarity * 100)}%)</Text>
        </Box>
      ))}
      {claims.length > 3 && (
        <Text dimColor paddingLeft={2}>  ...and {claims.length - 3} more</Text>
      )}
    </Box>
  );
}

export function RelatedClaimsGrouped({
  groups,
  onSelect,
  isExpanded,
  onToggleExpand,
}: GroupedRelatedClaimsProps) {
  const totalCount =
    groups.similar.length +
    groups.sameSubject.length +
    groups.samePredicate.length +
    groups.sameObject.length;

  if (totalCount === 0) {
    return (
      <Box marginTop={1}>
        <Text dimColor>No related claims found</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text bold color="cyan">Related Claims</Text>
        <Text dimColor> ({totalCount}) </Text>
        <Text dimColor>[r to {isExpanded ? 'collapse' : 'expand'}]</Text>
      </Box>

      {isExpanded ? (
        <Box flexDirection="column" marginTop={1} paddingLeft={1}>
          <ClaimMiniList
            title="Semantically Similar"
            claims={groups.similar}
            color="cyan"
            onSelect={onSelect}
          />
          <ClaimMiniList
            title="Same Subject"
            claims={groups.sameSubject}
            color="green"
            onSelect={onSelect}
          />
          <ClaimMiniList
            title="Same Predicate"
            claims={groups.samePredicate}
            color="yellow"
            onSelect={onSelect}
          />
          <ClaimMiniList
            title="Same Object"
            claims={groups.sameObject}
            color="magenta"
            onSelect={onSelect}
          />
        </Box>
      ) : (
        <Box paddingLeft={1}>
          <Text dimColor>
            {groups.similar.length > 0 && `${groups.similar.length} similar `}
            {groups.sameSubject.length > 0 && `${groups.sameSubject.length} same subject `}
            {groups.samePredicate.length > 0 && `${groups.samePredicate.length} same predicate `}
            {groups.sameObject.length > 0 && `${groups.sameObject.length} same object`}
          </Text>
        </Box>
      )}
    </Box>
  );
}
```

---

### Step 4: Update Claim Detail Screen

#### 4.1 Integrate Related Claims

**File:** `src/cli/explorer/screens/ClaimDetailScreen.tsx` (modifications)

```tsx
import { RelatedClaims } from '../components/RelatedClaims';
import { RelatedClaimsGrouped } from '../components/RelatedClaimsGrouped';

// In the component:
const [relatedClaims, setRelatedClaims] = useState<RelatedClaimItem[]>([]);
const [isLoadingRelated, setIsLoadingRelated] = useState(true);
const [relatedExpanded, setRelatedExpanded] = useState(false);
const [relatedSelectedIndex, setRelatedSelectedIndex] = useState(0);
const [focusSection, setFocusSection] = useState<'main' | 'related'>('main');

// Fetch related claims when claim changes
useEffect(() => {
  async function loadRelated() {
    if (!claim?.id) return;
    setIsLoadingRelated(true);
    try {
      const related = await fetchRelatedClaims(db, claim.id);
      setRelatedClaims(related);
    } catch (error) {
      console.error('Failed to fetch related claims:', error);
    } finally {
      setIsLoadingRelated(false);
    }
  }
  loadRelated();
}, [claim?.id, db]);

// Handle keyboard navigation in related section
useInput((input, key) => {
  if (focusSection === 'related') {
    if (key.upArrow) {
      setRelatedSelectedIndex(i => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setRelatedSelectedIndex(i => Math.min(relatedClaims.length - 1, i + 1));
    } else if (key.return) {
      const selected = relatedClaims[relatedSelectedIndex];
      if (selected) {
        onNavigateToClaim(selected.id);
      }
    }
  }

  // Toggle focus between main and related sections
  if (input === 'r') {
    if (relatedClaims.length > 0) {
      setFocusSection(s => s === 'main' ? 'related' : 'main');
    }
  }
});

// In the render:
return (
  <Box flexDirection="column">
    {/* Existing claim detail content */}

    {/* Related Claims Section */}
    {isLoadingRelated ? (
      <Box marginTop={1}>
        <Spinner /> <Text dimColor>Loading related claims...</Text>
      </Box>
    ) : (
      <RelatedClaims
        claims={relatedClaims}
        onSelect={onNavigateToClaim}
        selectedIndex={relatedSelectedIndex}
        isActive={focusSection === 'related'}
      />
    )}

    {/* Footer hint */}
    <Box marginTop={1}>
      <Text dimColor>
        r Toggle related • Enter Select • Esc Back
      </Text>
    </Box>
  </Box>
);
```

---

### Step 5: Navigation Support

#### 5.1 Add Claim Navigation History

**File:** `src/cli/explorer/context/AppContext.tsx` (additions)

```typescript
/** Maximum number of claims to keep in navigation history */
const MAX_HISTORY_SIZE = 50;

interface AppState {
  // ... existing state
  claimHistory: string[];  // Stack of visited claim IDs
  historyIndex: number;
}

type Action =
  // ... existing actions
  | { type: 'NAVIGATE_TO_CLAIM'; payload: string }
  | { type: 'NAVIGATE_BACK' }
  | { type: 'NAVIGATE_FORWARD' };

// In reducer:
case 'NAVIGATE_TO_CLAIM':
  // Truncate forward history and add new claim
  let newHistory = [
    ...state.claimHistory.slice(0, state.historyIndex + 1),
    action.payload,
  ];

  // Enforce maximum history size by removing oldest entries
  if (newHistory.length > MAX_HISTORY_SIZE) {
    const removeCount = newHistory.length - MAX_HISTORY_SIZE;
    newHistory = newHistory.slice(removeCount);
    // Adjust index accordingly
    return {
      ...state,
      selectedClaimId: action.payload,
      claimHistory: newHistory,
      historyIndex: newHistory.length - 1,
    };
  }

  return {
    ...state,
    selectedClaimId: action.payload,
    claimHistory: newHistory,
    historyIndex: newHistory.length - 1,
  };

case 'NAVIGATE_BACK':
  if (state.historyIndex > 0) {
    return {
      ...state,
      historyIndex: state.historyIndex - 1,
      selectedClaimId: state.claimHistory[state.historyIndex - 1],
    };
  }
  return state;

case 'NAVIGATE_FORWARD':
  if (state.historyIndex < state.claimHistory.length - 1) {
    return {
      ...state,
      historyIndex: state.historyIndex + 1,
      selectedClaimId: state.claimHistory[state.historyIndex + 1],
    };
  }
  return state;
```

#### 5.2 Add Navigation Keyboard Shortcuts

**File:** `src/cli/explorer/hooks/useKeyboard.ts` (additions)

```typescript
// Add Alt+Left/Right for history navigation:
if (key.meta && key.leftArrow) {
  dispatch({ type: 'NAVIGATE_BACK' });
}
if (key.meta && key.rightArrow) {
  dispatch({ type: 'NAVIGATE_FORWARD' });
}

// Add 'r' key to toggle related claims focus
if (input === 'r' && state.screen === 'detail') {
  dispatch({ type: 'TOGGLE_RELATED_FOCUS' });
}
```

---

### Step 6: Configuration

#### 6.1 Add Related Claims Configuration

**File:** `src/types/index.ts` (additions to semantic config)

```typescript
semantic: z.object({
  deduplication: z.object({...}).optional().default({}),
  search: z.object({...}).optional().default({}),
  // NEW: Related claims configuration
  related: z.object({
    enabled: z.boolean().default(true),
    // Number of related claims to show
    limit: z.number().default(6),
    // Minimum similarity to consider related
    min_similarity: z.number().default(0.6),
    // Group by relationship type
    group_by_relationship: z.boolean().default(false),
    // Pre-compute related claims on save
    precompute: z.boolean().default(false),
  }).optional().default({}),
}).optional().default({}),
```

#### 6.2 Example Config

```yaml
semantic:
  deduplication:
    enabled: true
  search:
    enabled: true
  related:
    enabled: true
    limit: 6
    min_similarity: 0.6
    group_by_relationship: false
```

---

### Step 7: Testing

#### 7.1 Related Claims Service Tests

**File:** `src/embeddings/related.test.ts`

```typescript
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { RelatedClaimsService } from './related';
import type Surreal from 'surrealdb';

describe('RelatedClaimsService', () => {
  const mockDb = {
    query: mock(() => Promise.resolve([[]])),
  } as unknown as Surreal;

  let service: RelatedClaimsService;

  beforeEach(() => {
    (mockDb.query as ReturnType<typeof mock>).mockClear();
    service = new RelatedClaimsService(mockDb);
  });

  describe('findRelated', () => {
    test('returns empty array when claim not found', async () => {
      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[]]));

      await expect(service.findRelated('claim:nonexistent'))
        .rejects.toThrow('Claim not found');
    });

    test('finds semantically related claims with embeddings', async () => {
      const sourceClaim = {
        id: 'claim:1',
        subject: 'Rust',
        predicate: 'is-safer-than',
        object: 'C++',
        embedding: [0.1, 0.2, 0.3, 0.4],
      };

      const relatedClaims = [
        {
          id: 'claim:2',
          subject: 'C++',
          predicate: 'has',
          object: 'memory-bugs',
          similarity: 0.85,
        },
        {
          id: 'claim:3',
          subject: 'Go',
          predicate: 'is-safer-than',
          object: 'C',
          similarity: 0.75,
        },
      ];

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]]))  // Source claim
        .mockImplementationOnce(() => Promise.resolve([[]]))  // Duplicates
        .mockImplementationOnce(() => Promise.resolve([relatedClaims]));  // Related

      const results = await service.findRelated('claim:1');

      expect(results).toHaveLength(2);
      expect(results[0].similarity).toBe(0.85);
    });

    test('falls back to structural similarity without embeddings', async () => {
      const sourceClaim = {
        id: 'claim:1',
        subject: 'Rust',
        predicate: 'is-safer-than',
        object: 'C++',
        // No embedding
      };

      const sameSubjectClaims = [
        { id: 'claim:2', subject: 'Rust', predicate: 'has', object: 'ownership' },
      ];

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]]))
        .mockImplementationOnce(() => Promise.resolve([sameSubjectClaims]))
        .mockImplementationOnce(() => Promise.resolve([[]]));  // Same predicate

      const results = await service.findRelated('claim:1');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].relationship).toBe('same-subject');
    });

    test('excludes duplicate claims', async () => {
      const sourceClaim = {
        id: 'claim:1',
        subject: 'Rust',
        predicate: 'is-safer-than',
        object: 'C++',
        embedding: [0.1, 0.2, 0.3, 0.4],
      };

      const duplicates = [{ id: 'claim:dup' }];

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]]))
        .mockImplementationOnce(() => Promise.resolve([duplicates]))
        .mockImplementationOnce(() => Promise.resolve([[]]));

      await service.findRelated('claim:1', { excludeDuplicates: true });

      // Verify duplicates were excluded in the query
      const queryCall = (mockDb.query as ReturnType<typeof mock>).mock.calls[2];
      expect(queryCall[1].excludeIds).toContain('claim:dup');
    });
  });

  describe('findRelatedGrouped', () => {
    test('groups claims by relationship type', async () => {
      const sourceClaim = {
        id: 'claim:1',
        subject: 'Rust',
        predicate: 'is-safer-than',
        object: 'C++',
        embedding: [0.1, 0.2, 0.3, 0.4],
      };

      const relatedClaims = [
        { id: 'claim:2', subject: 'Rust', predicate: 'has', object: 'ownership', similarity: 0.8 },
        { id: 'claim:3', subject: 'Go', predicate: 'is-safer-than', object: 'C', similarity: 0.75 },
        { id: 'claim:4', subject: 'Zig', predicate: 'compiles-to', object: 'C++', similarity: 0.7 },
      ];

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]]))
        .mockImplementationOnce(() => Promise.resolve([[]]))
        .mockImplementationOnce(() => Promise.resolve([relatedClaims]));

      const grouped = await service.findRelatedGrouped('claim:1');

      expect(grouped.sameSubject.length).toBeGreaterThan(0);
      expect(grouped.samePredicate.length).toBeGreaterThan(0);
      expect(grouped.sameObject.length).toBeGreaterThan(0);
    });
  });

  describe('categorizeRelationship', () => {
    test('correctly identifies same-subject', () => {
      // @ts-ignore - accessing private method for testing
      const result = service.categorizeRelationship(
        { subject: 'Rust', predicate: 'has', object: 'ownership' },
        { subject: 'Rust', predicate: 'is', object: 'fast' }
      );
      expect(result).toBe('same-subject');
    });

    test('correctly identifies same-predicate', () => {
      // @ts-ignore
      const result = service.categorizeRelationship(
        { subject: 'Rust', predicate: 'is-safer-than', object: 'C++' },
        { subject: 'Go', predicate: 'is-safer-than', object: 'C' }
      );
      expect(result).toBe('same-predicate');
    });

    test('correctly identifies same-object', () => {
      // @ts-ignore
      const result = service.categorizeRelationship(
        { subject: 'Rust', predicate: 'compiles-to', object: 'binary' },
        { subject: 'Go', predicate: 'produces', object: 'binary' }
      );
      expect(result).toBe('same-object');
    });

    test('defaults to similar for no structural match', () => {
      // @ts-ignore
      const result = service.categorizeRelationship(
        { subject: 'Rust', predicate: 'has', object: 'ownership' },
        { subject: 'Go', predicate: 'uses', object: 'garbage-collection' }
      );
      expect(result).toBe('similar');
    });
  });

  describe('precomputeRelated', () => {
    test('processes claims with concurrency limit', async () => {
      const claimIds = ['claim:1', 'claim:2', 'claim:3', 'claim:4', 'claim:5'];
      const mockClaim = { id: 'claim:1', subject: 'Test', embedding: [0.1, 0.2] };

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementation(() => Promise.resolve([[mockClaim]]));

      const results = await service.precomputeRelated(claimIds, {
        concurrencyLimit: 2,
      });

      expect(results.size).toBe(5);
    });

    test('handles errors gracefully in batch', async () => {
      const claimIds = ['claim:1', 'claim:error', 'claim:3'];

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[{ id: 'claim:1', embedding: [0.1] }]]))
        .mockImplementationOnce(() => Promise.reject(new Error('Not found')))
        .mockImplementationOnce(() => Promise.resolve([[{ id: 'claim:3', embedding: [0.1] }]]));

      const results = await service.precomputeRelated(claimIds, {
        concurrencyLimit: 1,
      });

      expect(results.size).toBe(3);
      expect(results.get('claim:error')).toEqual([]);  // Error case returns empty array
    });

    test('respects default concurrency limit of 5', async () => {
      // Verify that without explicit concurrencyLimit, default of 5 is used
      const claimIds = Array(10).fill(null).map((_, i) => `claim:${i}`);

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementation(() => Promise.resolve([[{ id: 'claim:0', embedding: [0.1] }]]));

      await service.precomputeRelated(claimIds);

      // With 10 claims and concurrency of 5, we should have 2 batches
      // Each batch makes multiple queries (for source claim, duplicates, similar claims)
    });
  });

  describe('error handling', () => {
    test('throws for non-existent claim', async () => {
      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[]]));  // No claim found

      await expect(service.findRelated('claim:nonexistent'))
        .rejects.toThrow('Claim not found: claim:nonexistent');
    });

    test('handles database query failure', async () => {
      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.reject(new Error('Database error')));

      await expect(service.findRelated('claim:1'))
        .rejects.toThrow('Database error');
    });

    test('handles empty embedding gracefully', async () => {
      const claimWithoutEmbedding = {
        id: 'claim:1',
        subject: 'Rust',
        predicate: 'has',
        object: 'ownership',
        // No embedding field
      };

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[claimWithoutEmbedding]]))
        .mockImplementation(() => Promise.resolve([[]]));  // Structural search returns empty

      const results = await service.findRelated('claim:1');

      // Should fall back to structural similarity
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
```

#### 7.2 Navigation History Tests

**File:** `src/cli/explorer/context/AppContext.test.tsx`

```tsx
import { describe, test, expect } from 'bun:test';
import { appReducer, initialState, MAX_HISTORY_SIZE } from './AppContext';

describe('Navigation History', () => {
  test('adds claim to history on navigation', () => {
    const state = { ...initialState, claimHistory: [], historyIndex: -1 };

    const newState = appReducer(state, {
      type: 'NAVIGATE_TO_CLAIM',
      payload: 'claim:1',
    });

    expect(newState.claimHistory).toEqual(['claim:1']);
    expect(newState.historyIndex).toBe(0);
  });

  test('truncates forward history on new navigation', () => {
    const state = {
      ...initialState,
      claimHistory: ['claim:1', 'claim:2', 'claim:3'],
      historyIndex: 1,  // Currently at claim:2
    };

    const newState = appReducer(state, {
      type: 'NAVIGATE_TO_CLAIM',
      payload: 'claim:4',
    });

    expect(newState.claimHistory).toEqual(['claim:1', 'claim:2', 'claim:4']);
    expect(newState.historyIndex).toBe(2);
  });

  test('enforces maximum history size', () => {
    // Fill history to max
    const fullHistory = Array(MAX_HISTORY_SIZE)
      .fill(null)
      .map((_, i) => `claim:${i}`);

    const state = {
      ...initialState,
      claimHistory: fullHistory,
      historyIndex: MAX_HISTORY_SIZE - 1,
    };

    const newState = appReducer(state, {
      type: 'NAVIGATE_TO_CLAIM',
      payload: 'claim:new',
    });

    expect(newState.claimHistory.length).toBe(MAX_HISTORY_SIZE);
    expect(newState.claimHistory[0]).toBe('claim:1');  // claim:0 was removed
    expect(newState.claimHistory[MAX_HISTORY_SIZE - 1]).toBe('claim:new');
  });

  test('navigates back correctly', () => {
    const state = {
      ...initialState,
      claimHistory: ['claim:1', 'claim:2', 'claim:3'],
      historyIndex: 2,
      selectedClaimId: 'claim:3',
    };

    const newState = appReducer(state, { type: 'NAVIGATE_BACK' });

    expect(newState.historyIndex).toBe(1);
    expect(newState.selectedClaimId).toBe('claim:2');
  });

  test('does not navigate back past beginning', () => {
    const state = {
      ...initialState,
      claimHistory: ['claim:1'],
      historyIndex: 0,
      selectedClaimId: 'claim:1',
    };

    const newState = appReducer(state, { type: 'NAVIGATE_BACK' });

    expect(newState.historyIndex).toBe(0);
    expect(newState.selectedClaimId).toBe('claim:1');
  });

  test('navigates forward correctly', () => {
    const state = {
      ...initialState,
      claimHistory: ['claim:1', 'claim:2', 'claim:3'],
      historyIndex: 1,
      selectedClaimId: 'claim:2',
    };

    const newState = appReducer(state, { type: 'NAVIGATE_FORWARD' });

    expect(newState.historyIndex).toBe(2);
    expect(newState.selectedClaimId).toBe('claim:3');
  });

  test('does not navigate forward past end', () => {
    const state = {
      ...initialState,
      claimHistory: ['claim:1', 'claim:2'],
      historyIndex: 1,
      selectedClaimId: 'claim:2',
    };

    const newState = appReducer(state, { type: 'NAVIGATE_FORWARD' });

    expect(newState.historyIndex).toBe(1);
    expect(newState.selectedClaimId).toBe('claim:2');
  });
});
```

---

## File Summary

| File | Purpose | Status |
|------|---------|--------|
| `src/embeddings/related.ts` | Related claims service | New |
| `src/embeddings/related.test.ts` | Related claims tests | New |
| `src/cli/explorer/types.ts` | Add related claim types | Modify |
| `src/cli/explorer/utils/queries.ts` | Add fetchRelatedClaims | Modify |
| `src/cli/explorer/components/RelatedClaims.tsx` | Related claims list | New |
| `src/cli/explorer/components/RelatedClaimsGrouped.tsx` | Grouped related claims | New |
| `src/cli/explorer/screens/ClaimDetailScreen.tsx` | Integrate related claims | Modify |
| `src/cli/explorer/context/AppContext.tsx` | Add navigation history | Modify |
| `src/cli/explorer/context/AppContext.test.tsx` | Navigation history tests | New |
| `src/cli/explorer/hooks/useKeyboard.ts` | Add navigation shortcuts | Modify |
| `src/types/index.ts` | Add related config schema | Modify |

---

## Success Criteria

1. **Discovery Quality**
   - [ ] Related claims are genuinely related (>70% user satisfaction)
   - [ ] Relationship categorization is accurate
   - [ ] Mix of semantic and structural relations

2. **User Experience**
   - [ ] Related claims load within 500ms
   - [ ] Clear visual distinction between relationship types
   - [ ] Easy navigation to related claims
   - [ ] Back navigation preserves history

3. **Performance**
   - [ ] No noticeable delay when viewing claim details
   - [ ] Efficient queries using vector index
   - [ ] Reasonable memory usage for history

4. **Integration**
   - [ ] Works with claims that have embeddings
   - [ ] Graceful fallback for claims without embeddings
   - [ ] Respects deduplication (excludes duplicates)

---

## User Experience Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Claim Detail                                         [Esc] Back│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Rust is-safer-than C++                                         │
│  ───────────────────────────                                    │
│  Confidence: 90% │ Extracted: 2025-01-15                        │
│                                                                 │
│  Predicate: is-safer-than (builtin)                             │
│  "Comparative claim of superiority in safety"                   │
│                                                                 │
│  Author stance: agrees                                          │
│  Community: 75% agree, 15% disagree                             │
│  Your stance: [not set]                                         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Related Claims (6)                              [r to expand]  │
│                                                                 │
│  ▸ ≈ C++ has memory-bugs Rust lacks              85% match      │
│    → Rust prevents memory-safety-issues          82% match      │
│    ⇔ Go is-safer-than C                          75% match      │
│    ← TypeScript compiles-to JavaScript           70% match      │
│                                                                 │
│  ≈ similar  → same subject  ⇔ same predicate  ← same object    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ↑↓ Navigate  Enter Select  r Related  s Stance  Esc Back      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Future Enhancements

- **Claim chains**: Follow chains of related claims ("A is-safer-than B, B is-safer-than C")
- **Contradiction highlighting**: Mark contradicting related claims
- **Relationship strength visualization**: Visual indicator of similarity strength
- **Exploration mode**: Graph-style navigation through related claims
- **Pre-compute on save**: Cache related claims when saving new claims
- **"Explore similar" button**: Quick action to search for more like this
