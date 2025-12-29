# Feature 5: Theme Clustering

## Overview

Automatically group related claims into coherent themes using clustering algorithms on embeddings. This enables users to see "big picture" patterns, discover emerging topics, and organize their knowledge base by concept rather than just chronology.

### Problem Statement

With hundreds or thousands of claims, it's difficult to:
- See overarching patterns and trends
- Understand which topics dominate the knowledge base
- Discover emerging themes before they become obvious
- Navigate claims by concept rather than date or subject
- Generate thematic summaries for digests

**Current limitations:**
- Claims are listed chronologically or by predicate
- No grouping by conceptual similarity
- Hard to answer "what are the main themes this week?"
- No way to see claim distribution across topics

### Solution

1. Periodically run clustering algorithms on claim embeddings
2. Use k-means, DBSCAN, or hierarchical clustering
3. Auto-generate cluster labels via LLM
4. Store cluster assignments in database
5. Add "Themes" view to explorer with drill-down

**Value:** Emerging topic detection, digest organization, trend analysis, conceptual navigation.

---

## Implementation Plan

### Step 1: Clustering Infrastructure

#### 1.1 Clustering Types and Interfaces

**File:** `src/embeddings/clustering/types.ts`

```typescript
export type ClusteringAlgorithm = 'kmeans' | 'dbscan' | 'hierarchical';

export interface ClusterConfig {
  algorithm: ClusteringAlgorithm;
  // K-means specific
  numClusters?: number;
  maxIterations?: number;
  // DBSCAN specific
  epsilon?: number;
  minPoints?: number;
  // Hierarchical specific
  linkage?: 'single' | 'complete' | 'average';
  distanceThreshold?: number;
  // General
  minClusterSize?: number;
}

export interface Theme {
  id: string;
  name: string;
  description?: string;
  keywords: string[];
  centroid: number[];
  claimCount: number;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export interface ClaimThemeAssignment {
  claimId: string;
  themeId: string;
  membershipScore: number;  // 0-1, how strongly this claim belongs
  assignedAt: Date;
}

export interface ClusteringResult {
  themes: Theme[];
  assignments: ClaimThemeAssignment[];
  unclustered: string[];  // Claim IDs that didn't fit any cluster
  stats: ClusteringStats;
}

export interface ClusteringStats {
  totalClaims: number;
  clusteredClaims: number;
  numThemes: number;
  avgClusterSize: number;
  silhouetteScore?: number;  // Cluster quality metric
  executionTimeMs: number;
}

export interface ThemeWithClaims extends Theme {
  claims: Array<{
    id: string;
    subject: string;
    predicate: string;
    object: string;
    membershipScore: number;
  }>;
}
```

#### 1.2 Clustering Algorithms Implementation

**File:** `src/embeddings/clustering/algorithms.ts`

```typescript
import { cosineSimilarity } from '../similarity';
import type { ClusterConfig } from './types';

interface ClusterAssignment {
  index: number;
  clusterId: number;
  score: number;
}

/**
 * K-means clustering implementation.
 * Simple but effective for well-separated clusters.
 */
export function kMeansClustering(
  embeddings: number[][],
  config: { numClusters: number; maxIterations?: number }
): ClusterAssignment[] {
  const { numClusters, maxIterations = 100 } = config;
  const n = embeddings.length;
  const dim = embeddings[0]?.length || 0;

  if (n < numClusters) {
    // Not enough points for requested clusters
    return embeddings.map((_, i) => ({
      index: i,
      clusterId: i % numClusters,
      score: 1.0,
    }));
  }

  // Initialize centroids using k-means++ strategy
  const centroids = initializeCentroidsKMeansPlusPlus(embeddings, numClusters);
  const assignments = new Array(n).fill(-1);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // Assign each point to nearest centroid
    for (let i = 0; i < n; i++) {
      let bestCluster = 0;
      let bestSimilarity = -Infinity;

      for (let c = 0; c < numClusters; c++) {
        const similarity = cosineSimilarity(embeddings[i], centroids[c]);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestCluster = c;
        }
      }

      if (assignments[i] !== bestCluster) {
        assignments[i] = bestCluster;
        changed = true;
      }
    }

    if (!changed) break;

    // Update centroids
    for (let c = 0; c < numClusters; c++) {
      const clusterPoints = embeddings.filter((_, i) => assignments[i] === c);

      if (clusterPoints.length > 0) {
        centroids[c] = averageEmbedding(clusterPoints);
      }
    }
  }

  // Calculate membership scores (similarity to centroid)
  return assignments.map((clusterId, index) => ({
    index,
    clusterId,
    score: cosineSimilarity(embeddings[index], centroids[clusterId]),
  }));
}

/**
 * DBSCAN clustering implementation.
 * Good for discovering clusters of varying shapes and sizes.
 */
export function dbscanClustering(
  embeddings: number[][],
  config: { epsilon: number; minPoints: number }
): ClusterAssignment[] {
  const { epsilon, minPoints } = config;
  const n = embeddings.length;

  const visited = new Array(n).fill(false);
  const assignments = new Array(n).fill(-1);  // -1 = noise
  let clusterId = 0;

  // Precompute similarity matrix for efficiency
  const similarities = computeSimilarityMatrix(embeddings);

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    visited[i] = true;

    const neighbors = getNeighbors(i, similarities, epsilon);

    if (neighbors.length < minPoints) {
      // Mark as noise (will be assigned -1)
      continue;
    }

    // Start new cluster
    assignments[i] = clusterId;
    const seedSet = [...neighbors];

    while (seedSet.length > 0) {
      const j = seedSet.pop()!;

      if (!visited[j]) {
        visited[j] = true;
        const jNeighbors = getNeighbors(j, similarities, epsilon);

        if (jNeighbors.length >= minPoints) {
          seedSet.push(...jNeighbors.filter(n => !visited[n]));
        }
      }

      if (assignments[j] === -1) {
        assignments[j] = clusterId;
      }
    }

    clusterId++;
  }

  // Calculate scores based on distance to cluster center
  const centroids = computeClusterCentroids(embeddings, assignments, clusterId);

  return assignments.map((cluster, index) => ({
    index,
    clusterId: cluster,
    score: cluster >= 0
      ? cosineSimilarity(embeddings[index], centroids[cluster])
      : 0,
  }));
}

/**
 * Hierarchical agglomerative clustering.
 * Creates a tree of clusters, good for exploring at different granularities.
 */
export function hierarchicalClustering(
  embeddings: number[][],
  config: { linkage: 'single' | 'complete' | 'average'; distanceThreshold: number }
): ClusterAssignment[] {
  const { linkage, distanceThreshold } = config;
  const n = embeddings.length;

  // Start with each point as its own cluster
  let clusters: number[][] = embeddings.map((_, i) => [i]);
  const similarities = computeSimilarityMatrix(embeddings);

  while (clusters.length > 1) {
    let bestI = 0, bestJ = 1;
    let bestSimilarity = -Infinity;

    // Find most similar pair of clusters
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = clusterSimilarity(clusters[i], clusters[j], similarities, linkage);
        if (sim > bestSimilarity) {
          bestSimilarity = sim;
          bestI = i;
          bestJ = j;
        }
      }
    }

    // Stop if similarity below threshold
    if (bestSimilarity < distanceThreshold) break;

    // Merge clusters
    clusters[bestI] = [...clusters[bestI], ...clusters[bestJ]];
    clusters.splice(bestJ, 1);
  }

  // Convert to assignments
  const assignments = new Array(n).fill(-1);
  clusters.forEach((cluster, clusterId) => {
    cluster.forEach(pointIndex => {
      assignments[pointIndex] = clusterId;
    });
  });

  // Calculate scores
  const centroids = computeClusterCentroids(embeddings, assignments, clusters.length);

  return assignments.map((cluster, index) => ({
    index,
    clusterId: cluster,
    score: cluster >= 0
      ? cosineSimilarity(embeddings[index], centroids[cluster])
      : 0,
  }));
}

// Helper functions

function initializeCentroidsKMeansPlusPlus(
  embeddings: number[][],
  k: number
): number[][] {
  const centroids: number[][] = [];
  const n = embeddings.length;

  // Pick first centroid randomly
  centroids.push([...embeddings[Math.floor(Math.random() * n)]]);

  // Pick remaining centroids
  for (let c = 1; c < k; c++) {
    const distances = embeddings.map(e => {
      const minDist = Math.min(
        ...centroids.map(cent => 1 - cosineSimilarity(e, cent))
      );
      return minDist * minDist;
    });

    const sum = distances.reduce((a, b) => a + b, 0);
    let random = Math.random() * sum;

    for (let i = 0; i < n; i++) {
      random -= distances[i];
      if (random <= 0) {
        centroids.push([...embeddings[i]]);
        break;
      }
    }
  }

  return centroids;
}

function averageEmbedding(embeddings: number[][]): number[] {
  const dim = embeddings[0].length;
  const avg = new Array(dim).fill(0);

  for (const e of embeddings) {
    for (let i = 0; i < dim; i++) {
      avg[i] += e[i];
    }
  }

  for (let i = 0; i < dim; i++) {
    avg[i] /= embeddings.length;
  }

  // Normalize
  const norm = Math.sqrt(avg.reduce((sum, v) => sum + v * v, 0));
  return avg.map(v => v / norm);
}

function computeSimilarityMatrix(embeddings: number[][]): number[][] {
  const n = embeddings.length;
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(embeddings[i], embeddings[j]);
      matrix[i][j] = sim;
      matrix[j][i] = sim;
    }
  }

  return matrix;
}

function getNeighbors(
  pointIndex: number,
  similarities: number[][],
  epsilon: number
): number[] {
  const neighbors: number[] = [];
  const threshold = 1 - epsilon;  // Convert distance to similarity

  for (let j = 0; j < similarities.length; j++) {
    if (j !== pointIndex && similarities[pointIndex][j] >= threshold) {
      neighbors.push(j);
    }
  }

  return neighbors;
}

function clusterSimilarity(
  cluster1: number[],
  cluster2: number[],
  similarities: number[][],
  linkage: 'single' | 'complete' | 'average'
): number {
  const sims: number[] = [];

  for (const i of cluster1) {
    for (const j of cluster2) {
      sims.push(similarities[i][j]);
    }
  }

  switch (linkage) {
    case 'single':
      return Math.max(...sims);
    case 'complete':
      return Math.min(...sims);
    case 'average':
      return sims.reduce((a, b) => a + b, 0) / sims.length;
  }
}

function computeClusterCentroids(
  embeddings: number[][],
  assignments: number[],
  numClusters: number
): number[][] {
  const centroids: number[][] = [];

  for (let c = 0; c < numClusters; c++) {
    const clusterEmbeddings = embeddings.filter((_, i) => assignments[i] === c);
    if (clusterEmbeddings.length > 0) {
      centroids[c] = averageEmbedding(clusterEmbeddings);
    } else {
      centroids[c] = embeddings[0];  // Fallback
    }
  }

  return centroids;
}

/**
 * Calculate silhouette score for cluster quality.
 * Range: -1 (bad) to 1 (good)
 */
export function calculateSilhouetteScore(
  embeddings: number[][],
  assignments: ClusterAssignment[]
): number {
  const n = embeddings.length;
  if (n < 2) return 0;

  const uniqueClusters = [...new Set(assignments.map(a => a.clusterId))];
  if (uniqueClusters.length < 2) return 0;

  let totalScore = 0;
  let validPoints = 0;

  for (let i = 0; i < n; i++) {
    const cluster = assignments[i].clusterId;
    if (cluster < 0) continue;  // Skip noise points

    // Calculate a(i): average distance to points in same cluster
    const sameCluster = assignments
      .filter(a => a.clusterId === cluster && a.index !== i)
      .map(a => a.index);

    if (sameCluster.length === 0) continue;

    const a = sameCluster
      .map(j => 1 - cosineSimilarity(embeddings[i], embeddings[j]))
      .reduce((sum, d) => sum + d, 0) / sameCluster.length;

    // Calculate b(i): minimum average distance to points in other clusters
    let b = Infinity;
    for (const otherCluster of uniqueClusters) {
      if (otherCluster === cluster || otherCluster < 0) continue;

      const otherPoints = assignments
        .filter(a => a.clusterId === otherCluster)
        .map(a => a.index);

      if (otherPoints.length === 0) continue;

      const avgDist = otherPoints
        .map(j => 1 - cosineSimilarity(embeddings[i], embeddings[j]))
        .reduce((sum, d) => sum + d, 0) / otherPoints.length;

      b = Math.min(b, avgDist);
    }

    if (b === Infinity) continue;

    const s = (b - a) / Math.max(a, b);
    totalScore += s;
    validPoints++;
  }

  return validPoints > 0 ? totalScore / validPoints : 0;
}
```

---

### Step 2: Theme Labeling Service

#### 2.1 LLM Theme Labeler

**File:** `src/embeddings/clustering/theme-labeler.ts`

```typescript
import { anthropic } from '../../mastra';
import type { ClaimRecord } from '../../types';

interface ThemeLabel {
  name: string;
  description: string;
  keywords: string[];
}

const LABELING_PROMPT = `You are analyzing a cluster of related claims to generate a theme label.

Here are the claims in this cluster:
{claims}

Based on these claims, generate a concise theme label. Respond in JSON format:
{
  "name": "Short theme name (2-4 words)",
  "description": "One sentence description of what this theme covers",
  "keywords": ["keyword1", "keyword2", "keyword3"]  // 3-5 keywords
}

Requirements:
- The name should be concise and descriptive
- The description should explain what connects these claims
- Keywords should help users find this theme

Respond only with valid JSON.`;

/**
 * Generate a label for a cluster of claims using LLM.
 */
export async function generateThemeLabel(
  claims: Array<{ subject: string; predicate: string; object: string }>
): Promise<ThemeLabel> {
  const claimTexts = claims
    .slice(0, 20)  // Limit to avoid token overflow
    .map(c => `- ${c.subject} ${c.predicate.replace(/-/g, ' ')} ${c.object}`)
    .join('\n');

  const prompt = LABELING_PROMPT.replace('{claims}', claimTexts);

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON in response');
    }

    const result = JSON.parse(jsonMatch[0]);

    return {
      name: result.name || 'Unnamed Theme',
      description: result.description || '',
      keywords: Array.isArray(result.keywords) ? result.keywords : [],
    };
  } catch (error) {
    // Fallback: generate label from most common subjects
    const subjects = claims.map(c => c.subject);
    const commonSubject = mostFrequent(subjects) || 'Mixed';

    return {
      name: `${commonSubject} Topics`,
      description: `Claims related to ${commonSubject}`,
      keywords: [...new Set(subjects)].slice(0, 5),
    };
  }
}

/**
 * Batch label multiple themes.
 */
export async function generateThemeLabels(
  clusters: Array<Array<{ subject: string; predicate: string; object: string }>>
): Promise<ThemeLabel[]> {
  const labels: ThemeLabel[] = [];

  // Process sequentially to avoid rate limits
  for (const cluster of clusters) {
    try {
      const label = await generateThemeLabel(cluster);
      labels.push(label);
    } catch (error) {
      console.warn('Failed to generate theme label:', error);
      labels.push({
        name: 'Unnamed Theme',
        description: '',
        keywords: [],
      });
    }

    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return labels;
}

function mostFrequent(arr: string[]): string | null {
  const counts = new Map<string, number>();
  for (const item of arr) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  let maxCount = 0;
  let maxItem: string | null = null;

  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxItem = item;
    }
  }

  return maxItem;
}
```

---

### Step 3: Theme Clustering Service

#### 3.1 Main Clustering Service

**File:** `src/embeddings/clustering/service.ts`

```typescript
import type Surreal from 'surrealdb';
import type { ClaimRecord } from '../../types';
import {
  kMeansClustering,
  dbscanClustering,
  hierarchicalClustering,
  calculateSilhouetteScore,
} from './algorithms';
import { generateThemeLabels } from './theme-labeler';
import type {
  ClusterConfig,
  Theme,
  ClaimThemeAssignment,
  ClusteringResult,
  ThemeWithClaims,
} from './types';

export class ThemeClusteringService {
  constructor(private db: Surreal) {}

  /**
   * Run clustering on all claims and update themes.
   */
  async clusterClaims(config: ClusterConfig): Promise<ClusteringResult> {
    const startTime = Date.now();

    // Get all canonical claims with embeddings
    const [claims] = await this.db.query<[ClaimRecord[]]>(`
      SELECT * FROM claim
      WHERE embedding IS NOT NONE AND is_canonical = true
      ORDER BY extracted_at DESC
    `);

    if (!claims || claims.length < config.minClusterSize!) {
      return {
        themes: [],
        assignments: [],
        unclustered: claims?.map(c => c.id as string) || [],
        stats: {
          totalClaims: claims?.length || 0,
          clusteredClaims: 0,
          numThemes: 0,
          avgClusterSize: 0,
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    const embeddings = claims.map(c => c.embedding!);

    // Run clustering algorithm
    const assignments = this.runClustering(embeddings, config);

    // Filter out noise points (clusterId = -1 for DBSCAN)
    const validAssignments = assignments.filter(a => a.clusterId >= 0);
    const numClusters = Math.max(...validAssignments.map(a => a.clusterId)) + 1;

    // Group claims by cluster
    const clusterClaims: Map<number, ClaimRecord[]> = new Map();
    for (const assignment of validAssignments) {
      const cluster = assignment.clusterId;
      if (!clusterClaims.has(cluster)) {
        clusterClaims.set(cluster, []);
      }
      clusterClaims.get(cluster)!.push(claims[assignment.index]);
    }

    // Filter out clusters that are too small
    const minSize = config.minClusterSize || 3;
    const validClusters = [...clusterClaims.entries()]
      .filter(([_, claims]) => claims.length >= minSize);

    // Generate theme labels
    const clusterClaimsList = validClusters.map(([_, claims]) =>
      claims.map(c => ({
        subject: c.subject,
        predicate: c.predicate,
        object: c.object,
      }))
    );

    const labels = await generateThemeLabels(clusterClaimsList);

    // Create themes
    const themes: Theme[] = [];
    const themeAssignments: ClaimThemeAssignment[] = [];
    const unclusteredIds: string[] = [];

    for (let i = 0; i < validClusters.length; i++) {
      const [clusterId, clusterClaimRecords] = validClusters[i];
      const label = labels[i];

      // Compute centroid
      const clusterEmbeddings = clusterClaimRecords.map(c => c.embedding!);
      const centroid = this.computeCentroid(clusterEmbeddings);

      const themeId = `theme:${Date.now()}_${i}`;
      const theme: Theme = {
        id: themeId,
        name: label.name,
        description: label.description,
        keywords: label.keywords,
        centroid,
        claimCount: clusterClaimRecords.length,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
      };
      themes.push(theme);

      // Create assignments
      for (const claim of clusterClaimRecords) {
        const assignmentData = assignments.find(
          a => claims[a.index].id === claim.id
        );
        themeAssignments.push({
          claimId: claim.id as string,
          themeId,
          membershipScore: assignmentData?.score || 0,
          assignedAt: new Date(),
        });
      }
    }

    // Identify unclustered claims
    const clusteredIds = new Set(themeAssignments.map(a => a.claimId));
    for (const claim of claims) {
      if (!clusteredIds.has(claim.id as string)) {
        unclusteredIds.push(claim.id as string);
      }
    }

    // Calculate quality metrics
    const silhouetteScore = calculateSilhouetteScore(embeddings, assignments);

    const stats = {
      totalClaims: claims.length,
      clusteredClaims: themeAssignments.length,
      numThemes: themes.length,
      avgClusterSize: themes.length > 0
        ? themeAssignments.length / themes.length
        : 0,
      silhouetteScore,
      executionTimeMs: Date.now() - startTime,
    };

    return { themes, assignments: themeAssignments, unclustered: unclusteredIds, stats };
  }

  /**
   * Save clustering results to database.
   */
  async saveClusteringResults(result: ClusteringResult): Promise<void> {
    // Deactivate old themes
    await this.db.query(`UPDATE theme SET isActive = false`);

    // Delete old assignments
    await this.db.query(`DELETE claim_theme`);

    // Create new themes
    for (const theme of result.themes) {
      await this.db.query(`
        CREATE theme SET
          id = $id,
          name = $name,
          description = $description,
          keywords = $keywords,
          centroid = $centroid,
          claimCount = $claimCount,
          createdAt = $createdAt,
          updatedAt = $updatedAt,
          isActive = $isActive
      `, {
        id: theme.id,
        name: theme.name,
        description: theme.description,
        keywords: theme.keywords,
        centroid: theme.centroid,
        claimCount: theme.claimCount,
        createdAt: theme.createdAt.toISOString(),
        updatedAt: theme.updatedAt.toISOString(),
        isActive: theme.isActive,
      });
    }

    // Create assignments
    for (const assignment of result.assignments) {
      await this.db.query(`
        RELATE $claimId->claim_theme->$themeId SET
          membershipScore = $score,
          assignedAt = $assignedAt
      `, {
        claimId: assignment.claimId,
        themeId: assignment.themeId,
        score: assignment.membershipScore,
        assignedAt: assignment.assignedAt.toISOString(),
      });
    }
  }

  /**
   * Get all active themes.
   */
  async getThemes(): Promise<Theme[]> {
    const [themes] = await this.db.query<[Theme[]]>(`
      SELECT * FROM theme
      WHERE isActive = true
      ORDER BY claimCount DESC
    `);
    return themes || [];
  }

  /**
   * Get theme with its claims.
   */
  async getThemeWithClaims(
    themeId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<ThemeWithClaims | null> {
    const { limit = 50, offset = 0 } = options;

    const [themes] = await this.db.query<[Theme[]]>(
      `SELECT * FROM theme WHERE id = $themeId`,
      { themeId }
    );

    if (!themes?.[0]) return null;

    const theme = themes[0];

    const [assignments] = await this.db.query<[any[]]>(`
      SELECT
        in.id AS id,
        in.subject AS subject,
        in.predicate AS predicate,
        in.object AS object,
        membershipScore
      FROM claim_theme
      WHERE out = $themeId
      ORDER BY membershipScore DESC
      LIMIT $limit
      START $offset
    `, { themeId, limit, offset });

    return {
      ...theme,
      claims: assignments || [],
    };
  }

  /**
   * Find which theme a claim belongs to.
   */
  async getClaimTheme(claimId: string): Promise<Theme | null> {
    const [result] = await this.db.query<[any[]]>(`
      SELECT out.* AS theme, membershipScore
      FROM claim_theme
      WHERE in = $claimId
      ORDER BY membershipScore DESC
      LIMIT 1
    `, { claimId });

    return result?.[0]?.theme || null;
  }

  /**
   * Find themes similar to a search query.
   */
  async searchThemes(
    queryEmbedding: number[],
    options: { limit?: number; minSimilarity?: number } = {}
  ): Promise<Array<Theme & { similarity: number }>> {
    const { limit = 10, minSimilarity = 0.5 } = options;

    const [themes] = await this.db.query<[Array<Theme & { similarity: number }>]>(`
      SELECT
        *,
        vector::similarity::cosine(centroid, $embedding) AS similarity
      FROM theme
      WHERE
        isActive = true
        AND vector::similarity::cosine(centroid, $embedding) >= $minSimilarity
      ORDER BY similarity DESC
      LIMIT $limit
    `, { embedding: queryEmbedding, minSimilarity, limit });

    return themes || [];
  }

  /**
   * Run the appropriate clustering algorithm.
   */
  private runClustering(
    embeddings: number[][],
    config: ClusterConfig
  ): Array<{ index: number; clusterId: number; score: number }> {
    switch (config.algorithm) {
      case 'kmeans':
        return kMeansClustering(embeddings, {
          numClusters: config.numClusters || Math.ceil(Math.sqrt(embeddings.length / 2)),
          maxIterations: config.maxIterations || 100,
        });

      case 'dbscan':
        return dbscanClustering(embeddings, {
          epsilon: config.epsilon || 0.3,
          minPoints: config.minPoints || 3,
        });

      case 'hierarchical':
        return hierarchicalClustering(embeddings, {
          linkage: config.linkage || 'average',
          distanceThreshold: config.distanceThreshold || 0.5,
        });

      default:
        throw new Error(`Unknown clustering algorithm: ${config.algorithm}`);
    }
  }

  /**
   * Compute centroid of a set of embeddings.
   */
  private computeCentroid(embeddings: number[][]): number[] {
    const dim = embeddings[0].length;
    const centroid = new Array(dim).fill(0);

    for (const e of embeddings) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += e[i];
      }
    }

    for (let i = 0; i < dim; i++) {
      centroid[i] /= embeddings.length;
    }

    // Normalize
    const norm = Math.sqrt(centroid.reduce((sum, v) => sum + v * v, 0));
    return centroid.map(v => v / norm);
  }
}
```

---

### Step 4: Database Schema

#### 4.1 Theme Schema

**File:** `src/db/migrations/003-theme-schema.ts`

```typescript
import type Surreal from 'surrealdb';

export const THEME_SCHEMA = `
-- Theme table
DEFINE TABLE theme SCHEMAFULL;
DEFINE FIELD name ON theme TYPE string;
DEFINE FIELD description ON theme TYPE option<string>;
DEFINE FIELD keywords ON theme TYPE array<string>;
DEFINE FIELD centroid ON theme TYPE array<float>;
DEFINE FIELD claimCount ON theme TYPE int;
DEFINE FIELD createdAt ON theme TYPE datetime;
DEFINE FIELD updatedAt ON theme TYPE datetime;
DEFINE FIELD isActive ON theme TYPE bool DEFAULT true;

-- Index for active themes
DEFINE INDEX idx_theme_active ON theme FIELDS isActive;

-- Vector index for theme similarity search
DEFINE INDEX idx_theme_centroid ON theme FIELDS centroid
  VECTOR MTREE DIMENSION 1536 DIST COSINE TYPE F32;

-- Claim to theme relation
DEFINE TABLE claim_theme TYPE RELATION FROM claim TO theme SCHEMAFULL;
DEFINE FIELD membershipScore ON claim_theme TYPE float;
DEFINE FIELD assignedAt ON claim_theme TYPE datetime;

-- Index for finding claims in a theme
DEFINE INDEX idx_claim_theme_score ON claim_theme FIELDS membershipScore;
`;

export async function migrateThemeSchema(db: Surreal): Promise<void> {
  console.log('Applying theme schema migration...');

  try {
    await db.query(THEME_SCHEMA);
    console.log('Theme schema applied successfully');
  } catch (error) {
    console.error('Failed to apply theme schema:', error);
    throw error;
  }
}
```

---

### Step 5: Explorer Integration

#### 5.1 Themes List Screen

**File:** `src/cli/explorer/screens/ThemesScreen.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useDatabase } from '../context/DatabaseContext';
import { ThemeClusteringService } from '../../../embeddings/clustering/service';
import type { Theme } from '../../../embeddings/clustering/types';

interface ThemesScreenProps {
  onBack: () => void;
  onSelectTheme: (themeId: string) => void;
}

export function ThemesScreen({ onBack, onSelectTheme }: ThemesScreenProps) {
  const { db } = useDatabase();
  const [themes, setThemes] = useState<Theme[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    async function loadThemes() {
      setIsLoading(true);
      setError(null);

      try {
        const service = new ThemeClusteringService(db);
        const loadedThemes = await service.getThemes();
        setThemes(loadedThemes);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load themes');
      } finally {
        setIsLoading(false);
      }
    }

    loadThemes();
  }, [db]);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onBack();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex(i => Math.min(themes.length - 1, i + 1));
    } else if (key.return) {
      const selected = themes[selectedIndex];
      if (selected) {
        onSelectTheme(selected.id);
      }
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Header title="Themes" />
        <Box padding={2}>
          <Spinner type="dots" />
          <Text> Loading themes...</Text>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Header title="Themes" />
        <Box padding={2}>
          <Text color="red">Error: {error}</Text>
        </Box>
        <Footer hints={['Esc Back']} />
      </Box>
    );
  }

  if (themes.length === 0) {
    return (
      <Box flexDirection="column">
        <Header title="Themes" />
        <Box flexDirection="column" padding={2}>
          <Text>No themes found.</Text>
          <Text dimColor>
            Run 'bun run themes:cluster' to generate themes from your claims.
          </Text>
        </Box>
        <Footer hints={['Esc Back']} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header title="Themes" />

      <Box flexDirection="column" paddingX={1}>
        {themes.map((theme, index) => {
          const isSelected = index === selectedIndex;

          return (
            <Box
              key={theme.id}
              flexDirection="column"
              marginBottom={1}
            >
              <Box>
                <Text color={isSelected ? 'blue' : undefined}>
                  {isSelected ? '▸ ' : '  '}
                </Text>
                <Text bold={isSelected} color={isSelected ? 'blue' : undefined}>
                  {theme.name}
                </Text>
                <Text dimColor> ({theme.claimCount} claims)</Text>
              </Box>

              {theme.description && (
                <Box paddingLeft={4}>
                  <Text dimColor>{theme.description}</Text>
                </Box>
              )}

              {theme.keywords.length > 0 && (
                <Box paddingLeft={4}>
                  <Text color="cyan">
                    {theme.keywords.slice(0, 5).join(' • ')}
                  </Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Footer
        hints={[
          '↑↓ Navigate',
          'Enter View Theme',
          'Esc Back',
        ]}
      />
    </Box>
  );
}
```

#### 5.2 Theme Detail Screen

**File:** `src/cli/explorer/screens/ThemeDetailScreen.tsx`

```tsx
import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { Header } from '../components/Header';
import { Footer } from '../components/Footer';
import { useDatabase } from '../context/DatabaseContext';
import { ThemeClusteringService } from '../../../embeddings/clustering/service';
import type { ThemeWithClaims } from '../../../embeddings/clustering/types';

interface ThemeDetailScreenProps {
  themeId: string;
  onBack: () => void;
  onSelectClaim: (claimId: string) => void;
}

export function ThemeDetailScreen({
  themeId,
  onBack,
  onSelectClaim,
}: ThemeDetailScreenProps) {
  const { db } = useDatabase();
  const [theme, setTheme] = useState<ThemeWithClaims | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    async function loadTheme() {
      setIsLoading(true);

      try {
        const service = new ThemeClusteringService(db);
        const loadedTheme = await service.getThemeWithClaims(themeId);
        setTheme(loadedTheme);
      } catch (err) {
        console.error('Failed to load theme:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadTheme();
  }, [db, themeId]);

  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onBack();
      return;
    }

    if (!theme) return;

    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex(i => Math.min(theme.claims.length - 1, i + 1));
    } else if (key.return) {
      const selected = theme.claims[selectedIndex];
      if (selected) {
        onSelectClaim(selected.id);
      }
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Header title="Theme" />
        <Box padding={2}>
          <Spinner type="dots" />
          <Text> Loading theme...</Text>
        </Box>
      </Box>
    );
  }

  if (!theme) {
    return (
      <Box flexDirection="column">
        <Header title="Theme" />
        <Box padding={2}>
          <Text color="red">Theme not found</Text>
        </Box>
        <Footer hints={['Esc Back']} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Header title={theme.name} />

      {/* Theme info */}
      <Box flexDirection="column" paddingX={1} marginBottom={1}>
        {theme.description && (
          <Text>{theme.description}</Text>
        )}
        <Box>
          <Text dimColor>Keywords: </Text>
          <Text color="cyan">{theme.keywords.join(', ')}</Text>
        </Box>
        <Text dimColor>{theme.claimCount} claims in this theme</Text>
      </Box>

      {/* Claims list */}
      <Box flexDirection="column" paddingX={1}>
        <Text bold marginBottom={1}>Claims:</Text>

        {theme.claims.map((claim, index) => {
          const isSelected = index === selectedIndex;

          return (
            <Box key={claim.id}>
              <Text color={isSelected ? 'blue' : undefined}>
                {isSelected ? '▸ ' : '  '}
              </Text>
              <Text bold={isSelected}>
                {claim.subject} {claim.predicate} {claim.object}
              </Text>
              <Text dimColor>
                {' '}({Math.round(claim.membershipScore * 100)}%)
              </Text>
            </Box>
          );
        })}
      </Box>

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

### Step 6: CLI Commands

#### 6.1 Theme Clustering Command

**File:** `src/cli/themes.ts`

```typescript
import { Command } from 'commander';
import { loadConfig } from '../config';
import { getDb, closeDb } from '../db';
import { ThemeClusteringService } from '../embeddings/clustering/service';
import type { ClusteringAlgorithm } from '../embeddings/clustering/types';

const program = new Command();

program
  .name('themes')
  .description('Manage theme clustering');

program
  .command('cluster')
  .description('Run clustering on claims to generate themes')
  .option('-a, --algorithm <algo>', 'Clustering algorithm (kmeans, dbscan, hierarchical)', 'kmeans')
  .option('-k, --clusters <count>', 'Number of clusters (kmeans)', '10')
  .option('-e, --epsilon <value>', 'Epsilon for DBSCAN', '0.3')
  .option('-m, --min-points <count>', 'Minimum points per cluster', '3')
  .option('--save', 'Save results to database')
  .action(async (options) => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const service = new ThemeClusteringService(db);

      console.log(`Running ${options.algorithm} clustering...\n`);

      const result = await service.clusterClaims({
        algorithm: options.algorithm as ClusteringAlgorithm,
        numClusters: parseInt(options.clusters, 10),
        epsilon: parseFloat(options.epsilon),
        minPoints: parseInt(options.minPoints, 10),
        minClusterSize: parseInt(options.minPoints, 10),
      });

      console.log('Clustering Results');
      console.log('==================');
      console.log(`Total claims: ${result.stats.totalClaims}`);
      console.log(`Clustered: ${result.stats.clusteredClaims}`);
      console.log(`Themes: ${result.stats.numThemes}`);
      console.log(`Avg cluster size: ${result.stats.avgClusterSize.toFixed(1)}`);
      if (result.stats.silhouetteScore !== undefined) {
        console.log(`Silhouette score: ${result.stats.silhouetteScore.toFixed(3)}`);
      }
      console.log(`Time: ${result.stats.executionTimeMs}ms`);
      console.log();

      if (result.themes.length > 0) {
        console.log('Themes:');
        for (const theme of result.themes) {
          console.log(`  • ${theme.name} (${theme.claimCount} claims)`);
          if (theme.description) {
            console.log(`    ${theme.description}`);
          }
          if (theme.keywords.length > 0) {
            console.log(`    Keywords: ${theme.keywords.join(', ')}`);
          }
        }
        console.log();
      }

      if (result.unclustered.length > 0) {
        console.log(`${result.unclustered.length} claims not assigned to any theme.`);
      }

      if (options.save) {
        console.log('\nSaving to database...');
        await service.saveClusteringResults(result);
        console.log('Done!');
      } else {
        console.log('\nUse --save to persist these themes.');
      }
    } finally {
      await closeDb();
    }
  });

program
  .command('list')
  .description('List all active themes')
  .action(async () => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const service = new ThemeClusteringService(db);
      const themes = await service.getThemes();

      if (themes.length === 0) {
        console.log('No themes found. Run "bun run themes:cluster --save" first.');
        return;
      }

      console.log('Active Themes');
      console.log('=============');
      for (const theme of themes) {
        console.log(`\n${theme.name} (${theme.claimCount} claims)`);
        if (theme.description) {
          console.log(`  ${theme.description}`);
        }
        console.log(`  Keywords: ${theme.keywords.join(', ')}`);
      }
    } finally {
      await closeDb();
    }
  });

program
  .command('show <themeId>')
  .description('Show details of a specific theme')
  .option('-l, --limit <count>', 'Number of claims to show', '20')
  .action(async (themeId, options) => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const service = new ThemeClusteringService(db);
      const theme = await service.getThemeWithClaims(themeId, {
        limit: parseInt(options.limit, 10),
      });

      if (!theme) {
        console.log('Theme not found.');
        return;
      }

      console.log(theme.name);
      console.log('='.repeat(theme.name.length));
      if (theme.description) {
        console.log(theme.description);
      }
      console.log(`Keywords: ${theme.keywords.join(', ')}`);
      console.log(`Total claims: ${theme.claimCount}`);
      console.log();

      console.log('Claims:');
      for (const claim of theme.claims) {
        const score = Math.round(claim.membershipScore * 100);
        console.log(`  [${score}%] ${claim.subject} ${claim.predicate} ${claim.object}`);
      }
    } finally {
      await closeDb();
    }
  });

program
  .command('for-claim <claimId>')
  .description('Find which theme a claim belongs to')
  .action(async (claimId) => {
    const config = loadConfig();
    const db = await getDb(config);

    try {
      const service = new ThemeClusteringService(db);
      const theme = await service.getClaimTheme(claimId);

      if (!theme) {
        console.log('This claim is not assigned to any theme.');
        return;
      }

      console.log(`Theme: ${theme.name}`);
      if (theme.description) {
        console.log(`Description: ${theme.description}`);
      }
      console.log(`Keywords: ${theme.keywords.join(', ')}`);
    } finally {
      await closeDb();
    }
  });

export { program as themesCommand };
```

#### 6.2 Add to Package.json

```json
{
  "scripts": {
    "themes": "bun run src/cli/themes.ts",
    "themes:cluster": "bun run src/cli/themes.ts cluster",
    "themes:list": "bun run src/cli/themes.ts list"
  }
}
```

---

### Step 7: Configuration

#### 7.1 Add Clustering Configuration

**File:** `src/types/index.ts` (additions)

```typescript
const ClusteringConfigSchema = z.object({
  enabled: z.boolean().default(true),
  // Clustering algorithm
  algorithm: z.enum(['kmeans', 'dbscan', 'hierarchical']).default('kmeans'),
  // Minimum cluster size to keep
  min_cluster_size: z.number().default(3),
  // K-means: number of clusters (0 = auto-detect)
  num_clusters: z.number().default(0),
  // DBSCAN: epsilon distance
  epsilon: z.number().default(0.3),
  // DBSCAN: minimum points
  min_points: z.number().default(3),
  // Hierarchical: linkage type
  linkage: z.enum(['single', 'complete', 'average']).default('average'),
  // How often to recompute (hours)
  recompute_interval_hours: z.number().default(24),
  // Use LLM for theme labeling
  use_llm_labels: z.boolean().default(true),
});

// Add to SemanticConfigSchema:
semantic: z.object({
  deduplication: z.object({...}).optional().default({}),
  search: z.object({...}).optional().default({}),
  related: z.object({...}).optional().default({}),
  contradictions: z.object({...}).optional().default({}),
  clustering: ClusteringConfigSchema.optional().default({}),
}).optional().default({}),
```

#### 7.2 Example Config

```yaml
semantic:
  clustering:
    enabled: true
    algorithm: kmeans
    min_cluster_size: 3
    num_clusters: 0  # Auto-detect
    recompute_interval_hours: 24
    use_llm_labels: true
```

---

### Step 8: Testing

#### 8.1 Clustering Algorithm Tests

**File:** `src/embeddings/clustering/algorithms.test.ts`

```typescript
import { describe, test, expect } from 'bun:test';
import {
  kMeansClustering,
  dbscanClustering,
  hierarchicalClustering,
  calculateSilhouetteScore,
} from './algorithms';

describe('kMeansClustering', () => {
  test('clusters similar embeddings together', () => {
    const embeddings = [
      // Cluster 1
      [1, 0, 0, 0],
      [0.9, 0.1, 0, 0],
      [0.95, 0.05, 0, 0],
      // Cluster 2
      [0, 1, 0, 0],
      [0.1, 0.9, 0, 0],
      [0.05, 0.95, 0, 0],
    ];

    const assignments = kMeansClustering(embeddings, { numClusters: 2 });

    // Points 0,1,2 should be in one cluster, 3,4,5 in another
    expect(assignments[0].clusterId).toBe(assignments[1].clusterId);
    expect(assignments[0].clusterId).toBe(assignments[2].clusterId);
    expect(assignments[3].clusterId).toBe(assignments[4].clusterId);
    expect(assignments[3].clusterId).toBe(assignments[5].clusterId);
    expect(assignments[0].clusterId).not.toBe(assignments[3].clusterId);
  });

  test('handles edge case with fewer points than clusters', () => {
    const embeddings = [[1, 0], [0, 1]];
    const assignments = kMeansClustering(embeddings, { numClusters: 5 });

    expect(assignments).toHaveLength(2);
  });
});

describe('dbscanClustering', () => {
  test('identifies clusters and noise points', () => {
    const embeddings = [
      // Dense cluster 1
      [1, 0, 0],
      [0.95, 0.05, 0],
      [0.9, 0.1, 0],
      // Dense cluster 2
      [0, 1, 0],
      [0.05, 0.95, 0],
      [0.1, 0.9, 0],
      // Noise point
      [0.5, 0.5, 0.7],
    ];

    const assignments = dbscanClustering(embeddings, {
      epsilon: 0.2,
      minPoints: 2,
    });

    // Check that dense points are clustered
    expect(assignments[0].clusterId).toBe(assignments[1].clusterId);
    expect(assignments[3].clusterId).toBe(assignments[4].clusterId);

    // Noise point should be -1 or in its own cluster
    const noisePoint = assignments[6];
    expect(noisePoint.clusterId === -1 || noisePoint.score < 0.5).toBe(true);
  });
});

describe('hierarchicalClustering', () => {
  test('creates hierarchical clusters', () => {
    const embeddings = [
      [1, 0, 0],
      [0.9, 0.1, 0],
      [0, 1, 0],
      [0.1, 0.9, 0],
    ];

    const assignments = hierarchicalClustering(embeddings, {
      linkage: 'average',
      distanceThreshold: 0.5,
    });

    expect(assignments).toHaveLength(4);
    // Similar points should be in same cluster
    expect(assignments[0].clusterId).toBe(assignments[1].clusterId);
    expect(assignments[2].clusterId).toBe(assignments[3].clusterId);
  });
});

describe('calculateSilhouetteScore', () => {
  test('returns high score for well-separated clusters', () => {
    const embeddings = [
      [1, 0], [0.9, 0.1], [0.95, 0.05],  // Cluster 0
      [0, 1], [0.1, 0.9], [0.05, 0.95],  // Cluster 1
    ];

    const assignments = [
      { index: 0, clusterId: 0, score: 1 },
      { index: 1, clusterId: 0, score: 1 },
      { index: 2, clusterId: 0, score: 1 },
      { index: 3, clusterId: 1, score: 1 },
      { index: 4, clusterId: 1, score: 1 },
      { index: 5, clusterId: 1, score: 1 },
    ];

    const score = calculateSilhouetteScore(embeddings, assignments);
    expect(score).toBeGreaterThan(0.5);  // Good separation
  });

  test('returns lower score for overlapping clusters', () => {
    const embeddings = [
      [0.5, 0.5], [0.6, 0.4], [0.4, 0.6],  // Overlapping
      [0.55, 0.45], [0.45, 0.55], [0.5, 0.5],
    ];

    const assignments = [
      { index: 0, clusterId: 0, score: 1 },
      { index: 1, clusterId: 0, score: 1 },
      { index: 2, clusterId: 0, score: 1 },
      { index: 3, clusterId: 1, score: 1 },
      { index: 4, clusterId: 1, score: 1 },
      { index: 5, clusterId: 1, score: 1 },
    ];

    const score = calculateSilhouetteScore(embeddings, assignments);
    expect(score).toBeLessThan(0.5);  // Poor separation
  });
});
```

#### 8.2 Clustering Service Tests

**File:** `src/embeddings/clustering/service.test.ts`

```typescript
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { ThemeClusteringService } from './service';
import type Surreal from 'surrealdb';

describe('ThemeClusteringService', () => {
  const mockDb = {
    query: mock(() => Promise.resolve([[]])),
  } as unknown as Surreal;

  let service: ThemeClusteringService;

  beforeEach(() => {
    (mockDb.query as ReturnType<typeof mock>).mockClear();
    service = new ThemeClusteringService(mockDb);
  });

  describe('clusterClaims', () => {
    test('returns empty result for insufficient claims', async () => {
      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[
          { id: 'claim:1', embedding: [1, 0, 0] },
        ]]));

      const result = await service.clusterClaims({
        algorithm: 'kmeans',
        minClusterSize: 3,
      });

      expect(result.themes).toHaveLength(0);
      expect(result.unclustered.length).toBeGreaterThan(0);
    });

    test('clusters claims and generates themes', async () => {
      const claims = [
        { id: 'claim:1', subject: 'Rust', predicate: 'has', object: 'ownership', embedding: [1, 0, 0, 0] },
        { id: 'claim:2', subject: 'Rust', predicate: 'has', object: 'borrowing', embedding: [0.95, 0.05, 0, 0] },
        { id: 'claim:3', subject: 'Rust', predicate: 'has', object: 'lifetimes', embedding: [0.9, 0.1, 0, 0] },
        { id: 'claim:4', subject: 'Go', predicate: 'has', object: 'goroutines', embedding: [0, 1, 0, 0] },
        { id: 'claim:5', subject: 'Go', predicate: 'has', object: 'channels', embedding: [0.05, 0.95, 0, 0] },
        { id: 'claim:6', subject: 'Go', predicate: 'has', object: 'gc', embedding: [0.1, 0.9, 0, 0] },
      ];

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([claims]));

      const result = await service.clusterClaims({
        algorithm: 'kmeans',
        numClusters: 2,
        minClusterSize: 2,
      });

      expect(result.themes.length).toBeGreaterThan(0);
      expect(result.assignments.length).toBe(6);
      expect(result.stats.clusteredClaims).toBe(6);
    });
  });

  describe('getThemes', () => {
    test('returns active themes sorted by claim count', async () => {
      const themes = [
        { id: 'theme:1', name: 'Rust Features', claimCount: 10, isActive: true },
        { id: 'theme:2', name: 'Go Concurrency', claimCount: 5, isActive: true },
      ];

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([themes]));

      const result = await service.getThemes();

      expect(result).toHaveLength(2);
      expect(result[0].claimCount).toBeGreaterThan(result[1].claimCount);
    });
  });

  describe('getThemeWithClaims', () => {
    test('returns theme with its claims', async () => {
      const theme = {
        id: 'theme:1',
        name: 'Rust Features',
        description: 'Claims about Rust language features',
        keywords: ['rust', 'ownership', 'safety'],
        claimCount: 3,
      };

      const assignments = [
        { id: 'claim:1', subject: 'Rust', predicate: 'has', object: 'ownership', membershipScore: 0.95 },
        { id: 'claim:2', subject: 'Rust', predicate: 'has', object: 'borrowing', membershipScore: 0.9 },
      ];

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[theme]]))
        .mockImplementationOnce(() => Promise.resolve([assignments]));

      const result = await service.getThemeWithClaims('theme:1');

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Rust Features');
      expect(result!.claims).toHaveLength(2);
    });

    test('returns null for non-existent theme', async () => {
      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[]]));

      const result = await service.getThemeWithClaims('theme:nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getClaimTheme', () => {
    test('returns theme for a claim', async () => {
      const result = [{ theme: { id: 'theme:1', name: 'Rust Features' } }];

      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([result]));

      const theme = await service.getClaimTheme('claim:1');

      expect(theme).not.toBeNull();
      expect(theme!.name).toBe('Rust Features');
    });

    test('returns null for unclustered claim', async () => {
      (mockDb.query as ReturnType<typeof mock>)
        .mockImplementationOnce(() => Promise.resolve([[]]));

      const theme = await service.getClaimTheme('claim:unclustered');

      expect(theme).toBeNull();
    });
  });
});
```

---

## File Summary

| File | Purpose | Status |
|------|---------|--------|
| `src/embeddings/clustering/types.ts` | Type definitions | New |
| `src/embeddings/clustering/algorithms.ts` | Clustering algorithms | New |
| `src/embeddings/clustering/algorithms.test.ts` | Algorithm tests | New |
| `src/embeddings/clustering/theme-labeler.ts` | LLM theme labeling | New |
| `src/embeddings/clustering/service.ts` | Main clustering service | New |
| `src/embeddings/clustering/service.test.ts` | Service tests | New |
| `src/db/migrations/003-theme-schema.ts` | Schema migration | New |
| `src/cli/themes.ts` | CLI commands | New |
| `src/cli/explorer/screens/ThemesScreen.tsx` | Themes list view | New |
| `src/cli/explorer/screens/ThemeDetailScreen.tsx` | Theme detail view | New |
| `src/types/index.ts` | Config schema updates | Modify |

---

## Success Criteria

1. **Clustering Quality**
   - [ ] Silhouette score > 0.3 on typical data
   - [ ] Themes are semantically coherent (user validation)
   - [ ] LLM-generated labels are accurate and descriptive

2. **User Experience**
   - [ ] Themes view accessible from main menu
   - [ ] Theme drill-down shows relevant claims
   - [ ] Clear indication of claim membership strength
   - [ ] Unclustered claims are accessible

3. **Performance**
   - [ ] Clustering 1000 claims < 30s
   - [ ] Theme list loads < 500ms
   - [ ] Theme detail loads < 500ms

4. **Integration**
   - [ ] CLI commands work correctly
   - [ ] Themes persist across sessions
   - [ ] Re-clustering updates themes cleanly

---

## User Experience Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Themes                                               [Esc] Back │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ▸ Rust Memory Safety (24 claims)                               │
│      Claims about Rust's ownership and borrowing system         │
│      rust • ownership • memory • safety • borrowing             │
│                                                                 │
│    Go Concurrency (18 claims)                                   │
│      Goroutines, channels, and Go's concurrency model           │
│      go • goroutines • channels • concurrency                   │
│                                                                 │
│    TypeScript Adoption (15 claims)                              │
│      Migration from JavaScript to TypeScript                    │
│      typescript • javascript • migration • types                │
│                                                                 │
│    Build Tools & Bundlers (12 claims)                           │
│      Comparisons of webpack, vite, esbuild, and others          │
│      webpack • vite • esbuild • bundler • build                 │
│                                                                 │
│    Database Comparisons (9 claims)                              │
│      PostgreSQL vs MySQL vs other databases                     │
│      postgresql • mysql • database • sql                        │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  ↑↓ Navigate  Enter View Theme  Esc Back                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Future Enhancements

- **Temporal clustering**: Track how themes evolve over time
- **Theme merging**: Manually merge similar themes
- **Theme splitting**: Split themes that are too broad
- **Hierarchical themes**: Nested theme structure
- **Theme suggestions**: Recommend themes based on new claims
- **Auto-recluster**: Trigger reclustering when enough new claims arrive
- **Theme comparison**: Compare themes across time periods
- **Export themes**: Generate themed digests or reports
