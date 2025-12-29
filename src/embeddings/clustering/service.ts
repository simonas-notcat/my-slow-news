/**
 * Theme clustering service.
 * Runs clustering on claims and manages theme storage.
 */

import type Surreal from "surrealdb";
import type { ClaimRecord } from "../../types";
import {
  kMeansClustering,
  dbscanClustering,
  hierarchicalClustering,
  calculateSilhouetteScore,
  averageEmbedding,
} from "./algorithms";
import type {
  ClusterConfig,
  Theme,
  ClaimThemeAssignment,
  ClusteringResult,
  ThemeWithClaims,
  ClusterAssignment,
} from "./types";

/** Default minimum cluster size */
const DEFAULT_MIN_CLUSTER_SIZE = 3;

/** Theme label type */
export interface ThemeLabel {
  name: string;
  description: string;
  keywords: string[];
}

/** Theme labeler function type */
export type ThemeLabelerFn = (
  clusters: Array<Array<{ subject: string; predicate: string; object: string }>>
) => Promise<ThemeLabel[]>;

/**
 * Create the default theme labeler using LLM.
 * This is lazy-loaded to avoid importing @mastra/core/agent unless needed.
 */
export function createDefaultLabeler(): ThemeLabelerFn {
  // Lazy import to avoid loading @mastra/core/agent during tests
  return async (clusters) => {
    const { generateThemeLabels } = await import("./theme-labeler");
    return generateThemeLabels(clusters);
  };
}

/**
 * Create a simple fallback labeler that doesn't use LLM.
 * Useful for tests or when LLM is unavailable.
 */
export function createFallbackLabeler(): ThemeLabelerFn {
  return async (clusters) => {
    return clusters.map((claims) => {
      const subjects = claims.map((c) => c.subject);
      const commonSubject = mostFrequent(subjects) || "Mixed";
      return {
        name: `${commonSubject} Topics`,
        description: `Claims related to ${commonSubject}`,
        keywords: [...new Set(subjects)].slice(0, 5),
      };
    });
  };
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

export class ThemeClusteringService {
  private labeler: ThemeLabelerFn;

  constructor(
    private db: Surreal,
    labeler?: ThemeLabelerFn
  ) {
    // Use provided labeler or default to fallback (lazy-load LLM labeler when called)
    this.labeler = labeler || createFallbackLabeler();
  }

  /**
   * Set the labeler function.
   * Call with createDefaultLabeler() to enable LLM-based labeling.
   */
  setLabeler(labeler: ThemeLabelerFn): void {
    this.labeler = labeler;
  }

  /**
   * Run clustering on all claims and generate themes.
   */
  async clusterClaims(config: ClusterConfig): Promise<ClusteringResult> {
    const startTime = Date.now();

    // Get all canonical claims with embeddings
    const [claims] = await this.db.query<[ClaimRecord[]]>(`
      SELECT * FROM claim
      WHERE embedding IS NOT NONE AND is_canonical = true
      ORDER BY extracted_at DESC
    `);

    const minClusterSize = config.minClusterSize ?? DEFAULT_MIN_CLUSTER_SIZE;

    if (!claims || claims.length < minClusterSize) {
      return {
        themes: [],
        assignments: [],
        unclustered: claims?.map((c) => c.id as string) || [],
        stats: {
          totalClaims: claims?.length || 0,
          clusteredClaims: 0,
          numThemes: 0,
          avgClusterSize: 0,
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    const embeddings = claims.map((c) => c.embedding!);

    // Run clustering algorithm
    const assignments = this.runClustering(embeddings, config);

    // Filter out noise points (clusterId = -1 for DBSCAN)
    const validAssignments = assignments.filter((a) => a.clusterId >= 0);
    const numClusters =
      validAssignments.length > 0
        ? Math.max(...validAssignments.map((a) => a.clusterId)) + 1
        : 0;

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
    const validClusters = [...clusterClaims.entries()].filter(
      ([_, clusterClaimsList]) => clusterClaimsList.length >= minClusterSize
    );

    // Generate theme labels
    const clusterClaimsList = validClusters.map(([_, claimsInCluster]) =>
      claimsInCluster.map((c) => ({
        subject: c.subject,
        predicate: c.predicate,
        object: c.object,
      }))
    );

    const labels = await this.labeler(clusterClaimsList);

    // Create themes
    const themes: Theme[] = [];
    const themeAssignments: ClaimThemeAssignment[] = [];
    const unclusteredIds: string[] = [];

    for (let i = 0; i < validClusters.length; i++) {
      const [clusterId, clusterClaimRecords] = validClusters[i];
      const label = labels[i];

      // Compute centroid
      const clusterEmbeddings = clusterClaimRecords.map((c) => c.embedding!);
      const centroid = averageEmbedding(clusterEmbeddings);

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
          (a) => claims[a.index].id === claim.id
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
    const clusteredIds = new Set(themeAssignments.map((a) => a.claimId));
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
      avgClusterSize:
        themes.length > 0 ? themeAssignments.length / themes.length : 0,
      silhouetteScore,
      executionTimeMs: Date.now() - startTime,
    };

    return {
      themes,
      assignments: themeAssignments,
      unclustered: unclusteredIds,
      stats,
    };
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
      await this.db.query(
        `
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
      `,
        {
          id: theme.id,
          name: theme.name,
          description: theme.description || null,
          keywords: theme.keywords,
          centroid: theme.centroid,
          claimCount: theme.claimCount,
          createdAt: theme.createdAt.toISOString(),
          updatedAt: theme.updatedAt.toISOString(),
          isActive: theme.isActive,
        }
      );
    }

    // Create assignments
    for (const assignment of result.assignments) {
      await this.db.query(
        `
        RELATE $claimId->claim_theme->$themeId SET
          membershipScore = $score,
          assignedAt = $assignedAt
      `,
        {
          claimId: assignment.claimId,
          themeId: assignment.themeId,
          score: assignment.membershipScore,
          assignedAt: assignment.assignedAt.toISOString(),
        }
      );
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

    const [assignments] = await this.db.query<
      [
        Array<{
          id: string;
          subject: string;
          predicate: string;
          object: string;
          membershipScore: number;
        }>,
      ]
    >(
      `
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
    `,
      { themeId, limit, offset }
    );

    return {
      ...theme,
      claims: assignments || [],
    };
  }

  /**
   * Find which theme a claim belongs to.
   */
  async getClaimTheme(claimId: string): Promise<Theme | null> {
    const [result] = await this.db.query<
      [Array<{ theme: Theme; membershipScore: number }>]
    >(
      `
      SELECT out.* AS theme, membershipScore
      FROM claim_theme
      WHERE in = $claimId
      ORDER BY membershipScore DESC
      LIMIT 1
    `,
      { claimId }
    );

    return result?.[0]?.theme || null;
  }

  /**
   * Find themes similar to a search query embedding.
   */
  async searchThemes(
    queryEmbedding: number[],
    options: { limit?: number; minSimilarity?: number } = {}
  ): Promise<Array<Theme & { similarity: number }>> {
    const { limit = 10, minSimilarity = 0.5 } = options;

    const [themes] = await this.db.query<
      [Array<Theme & { similarity: number }>]
    >(
      `
      SELECT
        *,
        vector::similarity::cosine(centroid, $embedding) AS similarity
      FROM theme
      WHERE
        isActive = true
        AND vector::similarity::cosine(centroid, $embedding) >= $minSimilarity
      ORDER BY similarity DESC
      LIMIT $limit
    `,
      { embedding: queryEmbedding, minSimilarity, limit }
    );

    return themes || [];
  }

  /**
   * Get statistics about themes.
   */
  async getStats(): Promise<{
    totalThemes: number;
    totalClustered: number;
    avgClusterSize: number;
    largestTheme?: { name: string; count: number };
  }> {
    const [themeStats] = await this.db.query<
      [{ total: number; totalClaims: number; avgSize: number }[]]
    >(`
      SELECT
        count() AS total,
        math::sum(claimCount) AS totalClaims,
        math::mean(claimCount) AS avgSize
      FROM theme
      WHERE isActive = true
      GROUP ALL
    `);

    const [largest] = await this.db.query<
      [Array<{ name: string; claimCount: number }>]
    >(`
      SELECT name, claimCount
      FROM theme
      WHERE isActive = true
      ORDER BY claimCount DESC
      LIMIT 1
    `);

    const stats = themeStats?.[0];

    return {
      totalThemes: stats?.total || 0,
      totalClustered: stats?.totalClaims || 0,
      avgClusterSize: stats?.avgSize || 0,
      largestTheme: largest?.[0]
        ? { name: largest[0].name, count: largest[0].claimCount }
        : undefined,
    };
  }

  /**
   * Run the appropriate clustering algorithm.
   */
  private runClustering(
    embeddings: number[][],
    config: ClusterConfig
  ): ClusterAssignment[] {
    switch (config.algorithm) {
      case "kmeans":
        return kMeansClustering(embeddings, {
          numClusters:
            config.numClusters || Math.ceil(Math.sqrt(embeddings.length / 2)),
          maxIterations: config.maxIterations || 100,
        });

      case "dbscan":
        return dbscanClustering(embeddings, {
          epsilon: config.epsilon || 0.3,
          minPoints: config.minPoints || 3,
        });

      case "hierarchical":
        return hierarchicalClustering(embeddings, {
          linkage: config.linkage || "average",
          distanceThreshold: config.distanceThreshold || 0.5,
        });

      default:
        throw new Error(`Unknown clustering algorithm: ${config.algorithm}`);
    }
  }
}
