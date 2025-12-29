# Feature 4: Contradiction Detection

## Overview

Detect and surface contradicting claims in the knowledge base to help users identify contested topics, build critical thinking skills, and understand different perspectives on issues.

### Problem Statement

The knowledge base may contain claims that directly contradict each other without any indication of conflict:

| Claim A | Claim B | Contradiction? |
|---------|---------|----------------|
| Rust is-safer-than C++ | C++ is-safer-than Rust | Direct contradiction |
| TypeScript improves productivity | TypeScript slows-down development | Semantic contradiction |
| Go has fast-compilation | Go has slow-compilation | Direct contradiction |
| React is-better-than Vue | Vue is-better-than React | Opposing opinions |

Currently, users have no way to:
- See when claims conflict with each other
- Understand which topics are contested
- Explore different viewpoints on the same subject
- Identify claims that need further investigation

### Solution

1. Find claim pairs with high semantic similarity (>0.8)
2. Detect opposition through:
   - Opposite predicates (supports vs opposes)
   - Negation patterns in subjects/objects
   - LLM-based semantic opposition analysis
3. Store contradiction relationships in the database
4. Surface contradictions in the explorer with a dedicated view

**Value:** Critical thinking aid, debate preparation, identifying contested topics.

---

## Implementation Plan

### Step 1: Contradiction Detection Service

Create a service to identify and analyze contradicting claims.

#### 1.1 Contradiction Types and Interfaces

**File:** `src/embeddings/contradictions/types.ts`

```typescript
export type ContradictionType =
  | 'direct'      // Exact opposite predicates (supports vs opposes)
  | 'semantic'    // LLM-detected semantic opposition
  | 'negation'    // Explicit negation ("X has Y" vs "X lacks Y")
  | 'comparative' // Opposing comparisons ("A > B" vs "B > A");

export interface ContradictionPair {
  claim1: {
    id: string;
    subject: string;
    predicate: string;
    object: string;
  };
  claim2: {
    id: string;
    subject: string;
    predicate: string;
    object: string;
  };
  similarity: number;
  contradictionType: ContradictionType;
  confidence: number;
  explanation?: string;
  detectedAt: Date;
}

export interface ContradictionDetectionOptions {
  minSimilarity?: number;      // Minimum semantic similarity to consider
  useLlmVerification?: boolean; // Use LLM for semantic contradiction check
  batchSize?: number;          // Batch size for processing
  limit?: number;              // Max contradictions to return
}

export interface ContradictionStats {
  totalContradictions: number;
  byType: Record<ContradictionType, number>;
  mostContestedSubjects: Array<{ subject: string; count: number }>;
  mostContestedPredicates: Array<{ predicate: string; count: number }>;
}
```

#### 1.2 Predicate Opposition Map

**File:** `src/embeddings/contradictions/predicate-opposites.ts`

```typescript
/**
 * Map of predicates to their opposites.
 * Used for detecting direct contradictions.
 */
export const PREDICATE_OPPOSITES: Record<string, string[]> = {
  // Support/Opposition
  'supports': ['opposes', 'rejects', 'criticizes'],
  'opposes': ['supports', 'endorses', 'promotes'],

  // Comparative
  'is-better-than': ['is-worse-than'],
  'is-worse-than': ['is-better-than'],
  'is-faster-than': ['is-slower-than'],
  'is-slower-than': ['is-faster-than'],
  'is-safer-than': ['is-less-safe-than', 'is-more-dangerous-than'],

  // Presence/Absence
  'has': ['lacks', 'missing'],
  'lacks': ['has', 'includes', 'contains'],

  // State changes
  'released': ['cancelled', 'discontinued'],
  'deprecated': ['introduced', 'released'],

  // Adoption
  'uses': ['abandoned', 'dropped'],
  'migrated-to': ['migrated-from'],
  'adopted': ['rejected', 'abandoned'],
};

/**
 * Check if two predicates are opposites.
 */
export function arePredicatesOpposite(p1: string, p2: string): boolean {
  const opposites1 = PREDICATE_OPPOSITES[p1] || [];
  const opposites2 = PREDICATE_OPPOSITES[p2] || [];

  return opposites1.includes(p2) || opposites2.includes(p1);
}

/**
 * Negation patterns that indicate contradiction.
 */
export const NEGATION_PATTERNS = [
  { positive: /^has[-\s]/, negative: /^lacks[-\s]|^missing[-\s]/ },
  { positive: /^is[-\s]/, negative: /^is[-\s]not[-\s]|^isnt[-\s]/ },
  { positive: /^can[-\s]/, negative: /^cannot[-\s]|^cant[-\s]/ },
  { positive: /^supports[-\s]/, negative: /^does[-\s]not[-\s]support/ },
];

/**
 * Check if two objects represent negation of each other.
 */
export function areObjectsNegated(obj1: string, obj2: string): boolean {
  const normalized1 = obj1.toLowerCase().replace(/[^a-z0-9\s-]/g, '');
  const normalized2 = obj2.toLowerCase().replace(/[^a-z0-9\s-]/g, '');

  for (const pattern of NEGATION_PATTERNS) {
    if (
      (pattern.positive.test(normalized1) && pattern.negative.test(normalized2)) ||
      (pattern.negative.test(normalized1) && pattern.positive.test(normalized2))
    ) {
      return true;
    }
  }

  return false;
}
```

#### 1.3 Contradiction Detection Service

**File:** `src/embeddings/contradictions/service.ts`

```typescript
import type Surreal from 'surrealdb';
import type { ClaimRecord } from '../../types';
import type { EmbeddingService } from '../index';
import { cosineSimilarity } from '../similarity';
import { arePredicatesOpposite, areObjectsNegated } from './predicate-opposites';
import type {
  ContradictionPair,
  ContradictionType,
  ContradictionDetectionOptions,
  ContradictionStats,
} from './types';

export class ContradictionDetectionService {
  constructor(
    private db: Surreal,
    private embeddings: EmbeddingService,
    private llmVerify?: (claim1: string, claim2: string) => Promise<{
      isContradiction: boolean;
      confidence: number;
      explanation: string;
    }>
  ) {}

  /**
   * Detect contradictions among claims.
   */
  async detectContradictions(
    options: ContradictionDetectionOptions = {}
  ): Promise<ContradictionPair[]> {
    const {
      minSimilarity = 0.7,
      useLlmVerification = true,
      batchSize = 100,
      limit = 100,
    } = options;

    const contradictions: ContradictionPair[] = [];

    // Get all canonical claims with embeddings
    const [claims] = await this.db.query<[ClaimRecord[]]>(`
      SELECT * FROM claim
      WHERE embedding IS NOT NONE AND is_canonical = true
    `);

    if (!claims || claims.length < 2) {
      return [];
    }

    // Process in batches to avoid memory issues
    for (let i = 0; i < claims.length && contradictions.length < limit; i++) {
      const claim1 = claims[i];

      for (let j = i + 1; j < claims.length && contradictions.length < limit; j++) {
        const claim2 = claims[j];

        // Check semantic similarity first
        const similarity = cosineSimilarity(
          claim1.embedding!,
          claim2.embedding!
        );

        if (similarity < minSimilarity) {
          continue;
        }

        // Check for structural contradictions
        const structuralResult = this.checkStructuralContradiction(claim1, claim2);

        if (structuralResult) {
          contradictions.push({
            claim1: this.claimToSummary(claim1),
            claim2: this.claimToSummary(claim2),
            similarity,
            contradictionType: structuralResult.type,
            confidence: structuralResult.confidence,
            detectedAt: new Date(),
          });
          continue;
        }

        // Use LLM verification for semantic contradictions
        if (useLlmVerification && this.llmVerify) {
          const claimText1 = this.formatClaimText(claim1);
          const claimText2 = this.formatClaimText(claim2);

          try {
            const llmResult = await this.llmVerify(claimText1, claimText2);

            if (llmResult.isContradiction && llmResult.confidence >= 0.7) {
              contradictions.push({
                claim1: this.claimToSummary(claim1),
                claim2: this.claimToSummary(claim2),
                similarity,
                contradictionType: 'semantic',
                confidence: llmResult.confidence,
                explanation: llmResult.explanation,
                detectedAt: new Date(),
              });
            }
          } catch (error) {
            console.warn('LLM verification failed:', error);
          }
        }
      }
    }

    return contradictions;
  }

  /**
   * Find contradictions for a specific claim.
   */
  async findContradictionsFor(
    claimId: string,
    options: { limit?: number; useLlmVerification?: boolean } = {}
  ): Promise<ContradictionPair[]> {
    const { limit = 10, useLlmVerification = true } = options;

    // Get the source claim
    const [sourceClaims] = await this.db.query<[ClaimRecord[]]>(
      `SELECT * FROM claim WHERE id = $claimId`,
      { claimId }
    );

    if (!sourceClaims?.[0]) {
      throw new Error(`Claim not found: ${claimId}`);
    }

    const source = sourceClaims[0];

    if (!source.embedding) {
      throw new Error('Claim has no embedding');
    }

    // Find similar claims
    const [similarClaims] = await this.db.query<[Array<ClaimRecord & { similarity: number }>]>(`
      SELECT
        *,
        vector::similarity::cosine(embedding, $embedding) AS similarity
      FROM claim
      WHERE
        embedding IS NOT NONE
        AND is_canonical = true
        AND id != $claimId
        AND vector::similarity::cosine(embedding, $embedding) >= 0.7
      ORDER BY similarity DESC
      LIMIT 50
    `, {
      embedding: source.embedding,
      claimId,
    });

    const contradictions: ContradictionPair[] = [];

    for (const candidate of similarClaims || []) {
      if (contradictions.length >= limit) break;

      // Check structural contradiction
      const structuralResult = this.checkStructuralContradiction(source, candidate);

      if (structuralResult) {
        contradictions.push({
          claim1: this.claimToSummary(source),
          claim2: this.claimToSummary(candidate),
          similarity: candidate.similarity,
          contradictionType: structuralResult.type,
          confidence: structuralResult.confidence,
          detectedAt: new Date(),
        });
        continue;
      }

      // LLM verification for semantic contradictions
      if (useLlmVerification && this.llmVerify) {
        try {
          const llmResult = await this.llmVerify(
            this.formatClaimText(source),
            this.formatClaimText(candidate)
          );

          if (llmResult.isContradiction && llmResult.confidence >= 0.7) {
            contradictions.push({
              claim1: this.claimToSummary(source),
              claim2: this.claimToSummary(candidate),
              similarity: candidate.similarity,
              contradictionType: 'semantic',
              confidence: llmResult.confidence,
              explanation: llmResult.explanation,
              detectedAt: new Date(),
            });
          }
        } catch (error) {
          console.warn('LLM verification failed:', error);
        }
      }
    }

    return contradictions;
  }

  /**
   * Get statistics about contradictions in the database.
   */
  async getStats(): Promise<ContradictionStats> {
    const [stats] = await this.db.query<[any[]]>(`
      SELECT
        count() AS total,
        relationship AS type
      FROM claim_similarity
      WHERE relationship = 'contradicts'
      GROUP BY relationship
    `);

    const [subjectStats] = await this.db.query<[any[]]>(`
      SELECT
        claim1.subject AS subject,
        count() AS count
      FROM claim_similarity
      WHERE relationship = 'contradicts'
      GROUP BY claim1.subject
      ORDER BY count DESC
      LIMIT 10
    `);

    const [predicateStats] = await this.db.query<[any[]]>(`
      SELECT
        claim1.predicate AS predicate,
        count() AS count
      FROM claim_similarity
      WHERE relationship = 'contradicts'
      GROUP BY claim1.predicate
      ORDER BY count DESC
      LIMIT 10
    `);

    return {
      totalContradictions: stats?.[0]?.total || 0,
      byType: {
        direct: 0,
        semantic: 0,
        negation: 0,
        comparative: 0,
      },
      mostContestedSubjects: subjectStats || [],
      mostContestedPredicates: predicateStats || [],
    };
  }

  /**
   * Store a detected contradiction in the database.
   */
  async storeContradiction(contradiction: ContradictionPair): Promise<void> {
    await this.db.query(`
      RELATE $from->claim_similarity->$to SET
        similarity = $similarity,
        relationship = 'contradicts',
        contradiction_type = $type,
        confidence = $confidence,
        explanation = $explanation,
        detected_at = $detectedAt
    `, {
      from: contradiction.claim1.id,
      to: contradiction.claim2.id,
      similarity: contradiction.similarity,
      type: contradiction.contradictionType,
      confidence: contradiction.confidence,
      explanation: contradiction.explanation || null,
      detectedAt: contradiction.detectedAt.toISOString(),
    });
  }

  /**
   * Check for structural contradictions (predicates, negation, comparison).
   */
  private checkStructuralContradiction(
    claim1: ClaimRecord,
    claim2: ClaimRecord
  ): { type: ContradictionType; confidence: number } | null {
    // Check for opposite predicates with same subject/object
    if (claim1.subject === claim2.subject && claim1.object === claim2.object) {
      if (arePredicatesOpposite(claim1.predicate, claim2.predicate)) {
        return { type: 'direct', confidence: 0.95 };
      }
    }

    // Check for comparative reversal (A > B vs B > A)
    if (
      claim1.subject === claim2.object &&
      claim1.object === claim2.subject &&
      claim1.predicate === claim2.predicate &&
      this.isComparativePredicate(claim1.predicate)
    ) {
      return { type: 'comparative', confidence: 0.9 };
    }

    // Check for negation patterns
    if (claim1.subject === claim2.subject && claim1.predicate === claim2.predicate) {
      if (areObjectsNegated(claim1.object, claim2.object)) {
        return { type: 'negation', confidence: 0.85 };
      }
    }

    return null;
  }

  /**
   * Check if a predicate is comparative.
   */
  private isComparativePredicate(predicate: string): boolean {
    const comparativePredicates = [
      'is-better-than',
      'is-worse-than',
      'is-faster-than',
      'is-slower-than',
      'is-safer-than',
      'is-more-popular-than',
      'outperforms',
    ];
    return comparativePredicates.includes(predicate);
  }

  /**
   * Format claim as readable text.
   */
  private formatClaimText(claim: ClaimRecord): string {
    const predicate = claim.predicate.replace(/-/g, ' ');
    return `${claim.subject} ${predicate} ${claim.object}`;
  }

  /**
   * Convert claim to summary object.
   */
  private claimToSummary(claim: ClaimRecord) {
    return {
      id: claim.id as string,
      subject: claim.subject,
      predicate: claim.predicate,
      object: claim.object,
    };
  }
}
```

---

### Step 2: LLM Contradiction Verification

#### 2.1 Contradiction Verification Agent

**File:** `src/embeddings/contradictions/llm-verifier.ts`

```typescript
import { anthropic } from '../../mastra';

const CONTRADICTION_PROMPT = `You are analyzing two claims to determine if they contradict each other.

Claim 1: {claim1}
Claim 2: {claim2}

A contradiction exists when:
1. The claims make opposite assertions about the same subject
2. One claim negates what the other asserts
3. Both claims cannot be true at the same time

Analyze these claims and respond in JSON format:
{
  "isContradiction": true/false,
  "confidence": 0.0-1.0,
  "explanation": "Brief explanation of why they do or don't contradict",
  "contradictionType": "direct" | "semantic" | "contextual" | "none"
}

Important:
- "direct" = explicit opposite claims
- "semantic" = same meaning expressed oppositely
- "contextual" = contradicts only in certain contexts
- "none" = no contradiction

Be conservative - only mark as contradiction if clearly incompatible.`;

export async function verifyContradictionWithLLM(
  claim1: string,
  claim2: string
): Promise<{
  isContradiction: boolean;
  confidence: number;
  explanation: string;
}> {
  const prompt = CONTRADICTION_PROMPT
    .replace('{claim1}', claim1)
    .replace('{claim2}', claim2);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const result = JSON.parse(jsonMatch[0]);

    return {
      isContradiction: Boolean(result.isContradiction),
      confidence: typeof result.confidence === 'number' ? result.confidence : 0,
      explanation: result.explanation || '',
    };
  } catch (error) {
    console.error('Failed to parse LLM response:', error);
    return {
      isContradiction: false,
      confidence: 0,
      explanation: 'Failed to analyze',
    };
  }
}
```

---

### Step 3: Database Schema Updates

#### 3.1 Contradiction Schema

**File:** `src/db/migrations/002-contradiction-schema.ts`

```typescript
import type Surreal from 'surrealdb';

export const CONTRADICTION_SCHEMA = `
-- Add contradiction-specific fields to claim_similarity
DEFINE FIELD contradiction_type ON claim_similarity TYPE option<string>;
  -- Values: 'direct', 'semantic', 'negation', 'comparative'
DEFINE FIELD explanation ON claim_similarity TYPE option<string>;

-- Index for finding contradictions
DEFINE INDEX idx_claim_similarity_contradicts ON claim_similarity
  FIELDS relationship
  WHERE relationship = 'contradicts';

-- Contradiction summary view (for stats)
DEFINE TABLE contradiction_stats AS
  SELECT
    count() AS total,
    contradiction_type AS type,
    math::mean(confidence) AS avg_confidence
  FROM claim_similarity
  WHERE relationship = 'contradicts'
  GROUP BY contradiction_type;
`;

export async function migrateContradictionSchema(db: Surreal): Promise<void> {
  console.log('Applying contradiction schema migration...');

  try {
    await db.query(CONTRADICTION_SCHEMA);
    console.log('Contradiction schema applied successfully');
  } catch (error) {
    console.error('Failed to apply contradiction schema:', error);
    throw error;
  }
}
```

---

### Step 4: Explorer Integration

#### 4.1 Contradictions List Component

**File:** `src/cli/explorer/components/ContradictionsList.tsx`

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { ContradictionPair } from '../../../embeddings/contradictions/types';

interface ContradictionsListProps {
  contradictions: ContradictionPair[];
  selectedIndex: number;
  isActive: boolean;
  onSelect: (contradiction: ContradictionPair) => void;
}

const TYPE_COLORS: Record<string, string> = {
  direct: 'red',
  semantic: 'yellow',
  negation: 'magenta',
  comparative: 'cyan',
};

const TYPE_ICONS: Record<string, string> = {
  direct: '⚡',
  semantic: '🔀',
  negation: '¬',
  comparative: '⇔',
};

export function ContradictionsList({
  contradictions,
  selectedIndex,
  isActive,
  onSelect,
}: ContradictionsListProps) {
  if (contradictions.length === 0) {
    return (
      <Box flexDirection="column" padding={2}>
        <Text color="green">No contradictions found!</Text>
        <Text dimColor>
          Your knowledge base appears to be internally consistent.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="red">Contradicting Claims</Text>
        <Text dimColor> ({contradictions.length})</Text>
      </Box>

      {contradictions.map((contradiction, index) => {
        const isSelected = isActive && index === selectedIndex;
        const typeColor = TYPE_COLORS[contradiction.contradictionType] || 'gray';
        const typeIcon = TYPE_ICONS[contradiction.contradictionType] || '?';

        return (
          <Box
            key={`${contradiction.claim1.id}-${contradiction.claim2.id}`}
            flexDirection="column"
            marginBottom={1}
            paddingLeft={1}
          >
            <Box>
              <Text color={isSelected ? 'blue' : undefined}>
                {isSelected ? '▸ ' : '  '}
              </Text>
              <Text color={typeColor}>{typeIcon} </Text>
              <Text bold={isSelected}>
                {contradiction.claim1.subject} {contradiction.claim1.predicate} {contradiction.claim1.object}
              </Text>
            </Box>
            <Box paddingLeft={4}>
              <Text dimColor>vs </Text>
              <Text>
                {contradiction.claim2.subject} {contradiction.claim2.predicate} {contradiction.claim2.object}
              </Text>
            </Box>
            <Box paddingLeft={4}>
              <Text dimColor>
                {Math.round(contradiction.confidence * 100)}% confident •
                {contradiction.contradictionType}
              </Text>
            </Box>
            {contradiction.explanation && (
              <Box paddingLeft={4}>
                <Text dimColor italic>"{contradiction.explanation}"</Text>
              </Box>
            )}
          </Box>
        );
      })}

      <Box marginTop={1}>
        <Text dimColor>
          ⚡ direct  🔀 semantic  ¬ negation  ⇔ comparative
        </Text>
      </Box>
    </Box>
  );
}
```

#### 4.2 Claim Detail Contradictions Section

**File:** `src/cli/explorer/components/ClaimContradictions.tsx`

```tsx
import React from 'react';
import { Box, Text } from 'ink';
import type { ContradictionPair } from '../../../embeddings/contradictions/types';

interface ClaimContradictionsProps {
  contradictions: ContradictionPair[];
  isExpanded: boolean;
  onToggle: () => void;
  onSelectContradiction: (claimId: string) => void;
}

export function ClaimContradictions({
  contradictions,
  isExpanded,
  onToggle,
  onSelectContradiction,
}: ClaimContradictionsProps) {
  if (contradictions.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text bold color="red">⚠ Contradictions</Text>
        <Text dimColor> ({contradictions.length}) </Text>
        <Text dimColor>[c to {isExpanded ? 'collapse' : 'expand'}]</Text>
      </Box>

      {isExpanded && (
        <Box flexDirection="column" paddingLeft={2} marginTop={1}>
          {contradictions.map((c, i) => (
            <Box key={i} marginBottom={1}>
              <Text color="yellow">• </Text>
              <Text>
                {c.claim2.subject} {c.claim2.predicate} {c.claim2.object}
              </Text>
              <Text dimColor> ({Math.round(c.confidence * 100)}%)</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
```

#### 4.3 Contradictions Screen

**File:** `src/cli/explorer/screens/ContradictionsScreen.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { ContradictionsList } from '../components/ContradictionsList';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useDatabase } from '../context/DatabaseContext';
import { ContradictionDetectionService } from '../../../embeddings/contradictions/service';
import type { ContradictionPair } from '../../../embeddings/contradictions/types';

interface ContradictionsScreenProps {
  onBack: () => void;
  onNavigateToClaim: (claimId: string) => void;
}

export function ContradictionsScreen({
  onBack,
  onNavigateToClaim,
}: ContradictionsScreenProps) {
  const { db } = useDatabase();
  const [contradictions, setContradictions] = useState<ContradictionPair[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    async function loadContradictions() {
      setIsLoading(true);
      setError(null);

      try {
        // Load stored contradictions from database
        const [stored] = await db.query<[any[]]>(`
          SELECT
            in AS claim1,
            out AS claim2,
            similarity,
            contradiction_type AS contradictionType,
            confidence,
            explanation,
            detected_at AS detectedAt
          FROM claim_similarity
          WHERE relationship = 'contradicts'
          ORDER BY confidence DESC
          LIMIT 50
        `);

        setContradictions(stored || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load contradictions');
      } finally {
        setIsLoading(false);
      }
    }

    loadContradictions();
  }, [db]);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onBack();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex(i => Math.min(contradictions.length - 1, i + 1));
    } else if (key.return) {
      const selected = contradictions[selectedIndex];
      if (selected) {
        onNavigateToClaim(selected.claim1.id);
      }
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Header title="Contradictions" />
        <Box padding={2}>
          <Spinner type="dots" />
          <Text> Loading contradictions...</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Header title="Contradictions" />
        <Box padding={2}>
          <Text color="red">Error: {error}</Text>
        </Box>
        <Footer hints={['Esc Back']} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header title="Contradictions" />
      <ContradictionsList
        contradictions={contradictions}
        selectedIndex={selectedIndex}
        isActive={true}
        onSelect={(c) => onNavigateToClaim(c.claim1.id)}
      />
      <Footer
        hints={[
          '↑↓ Navigate',
          'Enter View Claim',
          'Esc Back',
        ]}
      />
    </Box>
  );
}
```

---

### Step 5: CLI Commands

#### 5.1 Contradiction Detection Command

**File:** `src/cli/contradictions.ts`

```typescript
import { Command } from 'commander';
import { loadConfig } from '../config';
import { getDb, closeDb } from '../db';
import { getEmbeddingService } from '../embeddings';
import { ContradictionDetectionService } from '../embeddings/contradictions/service';
import { verifyContradictionWithLLM } from '../embeddings/contradictions/llm-verifier';

const program = new Command();

program
  .name('contradictions')
  .description('Detect and manage contradicting claims');

program
  .command('detect')
  .description('Scan for contradicting claims')
  .option('-l, --limit <count>', 'Maximum contradictions to find', '50')
  .option('-s, --similarity <threshold>', 'Minimum similarity threshold', '0.7')
  .option('--no-llm', 'Skip LLM verification')
  .option('--save', 'Save detected contradictions to database')
  .action(async (options) => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const embeddingService = getEmbeddingService(config.embeddings);
      const service = new ContradictionDetectionService(
        db,
        embeddingService,
        options.llm ? verifyContradictionWithLLM : undefined
      );

      console.log('Scanning for contradictions...\n');

      const contradictions = await service.detectContradictions({
        limit: parseInt(options.limit, 10),
        minSimilarity: parseFloat(options.similarity),
        useLlmVerification: options.llm,
      });

      if (contradictions.length === 0) {
        console.log('No contradictions found!');
        return;
      }

      console.log(`Found ${contradictions.length} contradictions:\n`);

      for (const c of contradictions) {
        console.log(`[${c.contradictionType}] ${Math.round(c.confidence * 100)}% confident`);
        console.log(`  "${c.claim1.subject} ${c.claim1.predicate} ${c.claim1.object}"`);
        console.log(`  vs`);
        console.log(`  "${c.claim2.subject} ${c.claim2.predicate} ${c.claim2.object}"`);
        if (c.explanation) {
          console.log(`  Reason: ${c.explanation}`);
        }
        console.log();

        if (options.save) {
          await service.storeContradiction(c);
        }
      }

      if (options.save) {
        console.log(`Saved ${contradictions.length} contradictions to database.`);
      }
    } finally {
      await closeDb();
    }
  });

program
  .command('stats')
  .description('Show contradiction statistics')
  .action(async () => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const embeddingService = getEmbeddingService(config.embeddings);
      const service = new ContradictionDetectionService(db, embeddingService);

      const stats = await service.getStats();

      console.log('Contradiction Statistics');
      console.log('========================');
      console.log(`Total contradictions: ${stats.totalContradictions}`);
      console.log();

      if (stats.mostContestedSubjects.length > 0) {
        console.log('Most contested subjects:');
        for (const s of stats.mostContestedSubjects.slice(0, 5)) {
          console.log(`  ${s.subject}: ${s.count} contradictions`);
        }
        console.log();
      }

      if (stats.mostContestedPredicates.length > 0) {
        console.log('Most contested predicates:');
        for (const p of stats.mostContestedPredicates.slice(0, 5)) {
          console.log(`  ${p.predicate}: ${p.count} contradictions`);
        }
      }
    } finally {
      await closeDb();
    }
  });

program
  .command('for <claimId>')
  .description('Find contradictions for a specific claim')
  .option('-l, --limit <count>', 'Maximum contradictions', '10')
  .action(async (claimId, options) => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const embeddingService = getEmbeddingService(config.embeddings);
      const service = new ContradictionDetectionService(
        db,
        embeddingService,
        verifyContradictionWithLLM
      );

      console.log(`Finding contradictions for ${claimId}...\n`);

      const contradictions = await service.findContradictionsFor(claimId, {
        limit: parseInt(options.limit, 10),
      });

      if (contradictions.length === 0) {
        console.log('No contradictions found for this claim.');
        return;
      }

      console.log(`Found ${contradictions.length} contradictions:\n`);

      for (const c of contradictions) {
        console.log(`[${c.contradictionType}] ${Math.round(c.confidence * 100)}%`);
        console.log(`  Contradicts: ${c.claim2.subject} ${c.claim2.predicate} ${c.claim2.object}`);
        if (c.explanation) {
          console.log(`  Reason: ${c.explanation}`);
        }
        console.log();
      }
    } finally {
      await closeDb();
    }
  });

export { program as contradictionsCommand };
```

---

### Step 6: Configuration

#### 6.1 Add Contradiction Configuration

**File:** `src/types/index.ts` (additions)

```typescript
const ContradictionConfigSchema = z.object({
  enabled: z.boolean().default(true),
  // Minimum similarity to consider for contradiction check
  similarity_threshold: z.number().default(0.7),
  // Use LLM for semantic contradiction verification
  use_llm_verification: z.boolean().default(true),
  // Minimum confidence to store as contradiction
  min_confidence: z.number().default(0.7),
  // Show contradictions in claim detail view
  show_in_detail: z.boolean().default(true),
});

// Add to SemanticConfigSchema:
semantic: z.object({
  deduplication: z.object({...}).optional().default({}),
  search: z.object({...}).optional().default({}),
  related: z.object({...}).optional().default({}),
  contradictions: ContradictionConfigSchema.optional().default({}),
}).optional().default({}),
```

#### 6.2 Example Config

```yaml
semantic:
  contradictions:
    enabled: true
    similarity_threshold: 0.7
    use_llm_verification: true
    min_confidence: 0.7
    show_in_detail: true
```

---

### Step 7: Testing

#### 7.1 Predicate Opposites Tests

**File:** `src/embeddings/contradictions/predicate-opposites.test.ts`

```typescript
import { describe, test, expect } from 'bun:test';
import { arePredicatesOpposite, areObjectsNegated } from './predicate-opposites';

describe('arePredicatesOpposite', () => {
  test('identifies supports/opposes as opposites', () => {
    expect(arePredicatesOpposite('supports', 'opposes')).toBe(true);
    expect(arePredicatesOpposite('opposes', 'supports')).toBe(true);
  });

  test('identifies comparative opposites', () => {
    expect(arePredicatesOpposite('is-better-than', 'is-worse-than')).toBe(true);
    expect(arePredicatesOpposite('is-faster-than', 'is-slower-than')).toBe(true);
  });

  test('identifies has/lacks as opposites', () => {
    expect(arePredicatesOpposite('has', 'lacks')).toBe(true);
  });

  test('returns false for non-opposite predicates', () => {
    expect(arePredicatesOpposite('supports', 'uses')).toBe(false);
    expect(arePredicatesOpposite('released', 'has')).toBe(false);
  });
});

describe('areObjectsNegated', () => {
  test('detects has/lacks negation', () => {
    expect(areObjectsNegated('has-memory-safety', 'lacks-memory-safety')).toBe(true);
  });

  test('returns false for unrelated objects', () => {
    expect(areObjectsNegated('fast-compilation', 'type-safety')).toBe(false);
  });
});
```

#### 7.2 Contradiction Service Tests

**File:** `src/embeddings/contradictions/service.test.ts`

```typescript
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { ContradictionDetectionService } from './service';
import type { EmbeddingService } from '../index';
import type Surreal from 'surrealdb';

describe('ContradictionDetectionService', () => {
  const mockEmbeddingService = {
    name: 'test',
    dimensions: 4,
  } as EmbeddingService;

  const mockDb = {
    query: mock(() => Promise.resolve([[]])),
  } as unknown as Surreal;

  let service: ContradictionDetectionService;

  beforeEach(() => {
    (mockDb.query as ReturnType<typeof mock>).mockClear();
    service = new ContradictionDetectionService(mockDb, mockEmbeddingService);
  });

  describe('detectContradictions', () => {
    test('detects direct contradictions with opposite predicates', async () => {
      const claims = [
        {
          id: 'claim:1',
          subject: 'Rust',
          predicate: 'supports',
          object: 'async',
          embedding: [1, 0, 0, 0],
        },
        {
          id: 'claim:2',
          subject: 'Rust',
          predicate: 'opposes',
          object: 'async',
          embedding: [0.99, 0.1, 0, 0],  // High similarity
        },
      ];

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([claims]));

      const contradictions = await service.detectContradictions({
        useLlmVerification: false,
      });

      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].contradictionType).toBe('direct');
    });

    test('detects comparative reversals', async () => {
      const claims = [
        {
          id: 'claim:1',
          subject: 'Rust',
          predicate: 'is-better-than',
          object: 'C++',
          embedding: [1, 0, 0, 0],
        },
        {
          id: 'claim:2',
          subject: 'C++',
          predicate: 'is-better-than',
          object: 'Rust',
          embedding: [0.95, 0.1, 0, 0],
        },
      ];

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([claims]));

      const contradictions = await service.detectContradictions({
        useLlmVerification: false,
      });

      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].contradictionType).toBe('comparative');
    });

    test('returns empty array when no contradictions exist', async () => {
      const claims = [
        {
          id: 'claim:1',
          subject: 'Rust',
          predicate: 'has',
          object: 'ownership',
          embedding: [1, 0, 0, 0],
        },
        {
          id: 'claim:2',
          subject: 'Go',
          predicate: 'has',
          object: 'goroutines',
          embedding: [0, 1, 0, 0],  // Low similarity
        },
      ];

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([claims]));

      const contradictions = await service.detectContradictions({
        useLlmVerification: false,
      });

      expect(contradictions).toHaveLength(0);
    });
  });

  describe('findContradictionsFor', () => {
    test('finds contradictions for specific claim', async () => {
      const sourceClaim = {
        id: 'claim:1',
        subject: 'Rust',
        predicate: 'is-safer-than',
        object: 'C++',
        embedding: [1, 0, 0, 0],
      };

      const contradictingClaim = {
        id: 'claim:2',
        subject: 'C++',
        predicate: 'is-safer-than',
        object: 'Rust',
        similarity: 0.9,
        embedding: [0.95, 0.1, 0, 0],
      };

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]]))
        .mockImplementationOnce(() => Promise.resolve([[contradictingClaim]]));

      const contradictions = await service.findContradictionsFor('claim:1', {
        useLlmVerification: false,
      });

      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].claim2.id).toBe('claim:2');
    });

    test('throws when claim not found', async () => {
      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[]]));

      await expect(service.findContradictionsFor('claim:nonexistent'))
        .rejects.toThrow('Claim not found');
    });
  });

  describe('storeContradiction', () => {
    test('stores contradiction relationship', async () => {
      const contradiction = {
        claim1: { id: 'claim:1', subject: 'A', predicate: 'has', object: 'B' },
        claim2: { id: 'claim:2', subject: 'A', predicate: 'lacks', object: 'B' },
        similarity: 0.9,
        contradictionType: 'negation' as const,
        confidence: 0.85,
        detectedAt: new Date(),
      };

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[]]));

      await service.storeContradiction(contradiction);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('RELATE'),
        expect.objectContaining({
          from: 'claim:1',
          to: 'claim:2',
          similarity: 0.9,
        })
      );
    });
  });
});
```

---

## File Summary

| File | Purpose | Status |
|------|---------|--------|
| `src/embeddings/contradictions/types.ts` | Type definitions | New |
| `src/embeddings/contradictions/predicate-opposites.ts` | Predicate opposition map | New |
| `src/embeddings/contradictions/service.ts` | Main detection service | New |
| `src/embeddings/contradictions/llm-verifier.ts` | LLM verification | New |
| `src/embeddings/contradictions/predicate-opposites.test.ts` | Predicate tests | New |
| `src/embeddings/contradictions/service.test.ts` | Service tests | New |
| `src/db/migrations/002-contradiction-schema.ts` | Schema migration | New |
| `src/cli/contradictions.ts` | CLI commands | New |
| `src/cli/explorer/components/ContradictionsList.tsx` | List component | New |
| `src/cli/explorer/components/ClaimContradictions.tsx` | Detail section | New |
| `src/cli/explorer/screens/ContradictionsScreen.tsx` | Contradictions view | New |
| `src/types/index.ts` | Config schema updates | Modify |

---

## Success Criteria

1. **Detection Accuracy**
   - [ ] Direct contradictions detected with >95% accuracy
   - [ ] Comparative reversals detected correctly
   - [ ] LLM semantic verification adds <10% false positives

2. **User Experience**
   - [ ] Contradictions view accessible from main menu
   - [ ] Contradictions shown in claim detail view
   - [ ] Clear visual distinction between contradiction types
   - [ ] Navigation between contradicting claims

3. **Performance**
   - [ ] Detection completes in <30s for 1000 claims
   - [ ] Claim-specific contradiction lookup <500ms
   - [ ] LLM verification batched for efficiency

4. **Integration**
   - [ ] CLI commands work correctly
   - [ ] Contradictions persist in database
   - [ ] Stats accurately reflect stored contradictions

---

## User Experience Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Contradictions                                        [Esc] Back│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Contradicting Claims (12)                                      │
│                                                                 │
│  ▸ ⚡ Rust is-safer-than C++                                    │
│       vs C++ is-safer-than Rust                                 │
│       95% confident • direct                                    │
│                                                                 │
│    🔀 TypeScript improves productivity                          │
│       vs TypeScript slows-down development                      │
│       82% confident • semantic                                  │
│       "Both claims address productivity but with opposite..."   │
│                                                                 │
│    ⇔ React is-better-than Vue                                   │
│       vs Vue is-better-than React                               │
│       90% confident • comparative                               │
│                                                                 │
│  ⚡ direct  🔀 semantic  ¬ negation  ⇔ comparative              │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ↑↓ Navigate  Enter View Claim  Esc Back                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Future Enhancements

- **Contradiction resolution**: Allow users to mark which claim they believe
- **Source tracking**: Show which sources made each contradicting claim
- **Temporal analysis**: Track when contradictions first appeared
- **Confidence evolution**: Update contradiction confidence as new evidence appears
- **Notification system**: Alert users when new contradictions are detected
- **Export contradictions**: Generate reports of contested topics
