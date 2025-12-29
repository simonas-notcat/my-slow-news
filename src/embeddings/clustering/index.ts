/**
 * Theme clustering module.
 * Groups related claims into coherent themes using embedding-based algorithms.
 */

export {
  ThemeClusteringService,
  createDefaultLabeler,
  createFallbackLabeler,
} from "./service";
export type { ThemeLabel, ThemeLabelerFn } from "./service";
export {
  kMeansClustering,
  dbscanClustering,
  hierarchicalClustering,
  calculateSilhouetteScore,
  averageEmbedding,
} from "./algorithms";
export type {
  ClusteringAlgorithm,
  ClusterConfig,
  Theme,
  ClaimThemeAssignment,
  ClusteringResult,
  ClusteringStats,
  ThemeWithClaims,
  ClusterAssignment,
} from "./types";
