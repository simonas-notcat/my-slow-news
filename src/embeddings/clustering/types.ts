/**
 * Types for theme clustering of claims.
 * Clusters similar claims into coherent themes using embedding-based algorithms.
 */

export type ClusteringAlgorithm = "kmeans" | "dbscan" | "hierarchical";

export interface ClusterConfig {
  algorithm: ClusteringAlgorithm;
  // K-means specific
  numClusters?: number;
  maxIterations?: number;
  // DBSCAN specific
  epsilon?: number;
  minPoints?: number;
  // Hierarchical specific
  linkage?: "single" | "complete" | "average";
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
  membershipScore: number; // 0-1, how strongly this claim belongs
  assignedAt: Date;
}

export interface ClusteringResult {
  themes: Theme[];
  assignments: ClaimThemeAssignment[];
  unclustered: string[]; // Claim IDs that didn't fit any cluster
  stats: ClusteringStats;
}

export interface ClusteringStats {
  totalClaims: number;
  clusteredClaims: number;
  numThemes: number;
  avgClusterSize: number;
  silhouetteScore?: number; // Cluster quality metric
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

/** Internal type for cluster assignment during algorithm execution */
export interface ClusterAssignment {
  index: number;
  clusterId: number;
  score: number;
}
