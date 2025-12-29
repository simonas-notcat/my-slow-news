/**
 * Clustering algorithms for grouping claims by semantic similarity.
 * Implements k-means, DBSCAN, and hierarchical clustering.
 */

import { cosineSimilarity } from "../similarity";
import type { ClusterAssignment } from "./types";

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

  if (n === 0) {
    return [];
  }

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

  if (n === 0) {
    return [];
  }

  const visited = new Array(n).fill(false);
  const assignments = new Array(n).fill(-1); // -1 = noise
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
          seedSet.push(...jNeighbors.filter((n) => !visited[n]));
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
    score:
      cluster >= 0
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
  config: {
    linkage: "single" | "complete" | "average";
    distanceThreshold: number;
  }
): ClusterAssignment[] {
  const { linkage, distanceThreshold } = config;
  const n = embeddings.length;

  if (n === 0) {
    return [];
  }

  // Start with each point as its own cluster
  let clusters: number[][] = embeddings.map((_, i) => [i]);
  const similarities = computeSimilarityMatrix(embeddings);

  while (clusters.length > 1) {
    let bestI = 0,
      bestJ = 1;
    let bestSimilarity = -Infinity;

    // Find most similar pair of clusters
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = clusterSimilarity(
          clusters[i],
          clusters[j],
          similarities,
          linkage
        );
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
    cluster.forEach((pointIndex) => {
      assignments[pointIndex] = clusterId;
    });
  });

  // Calculate scores
  const centroids = computeClusterCentroids(
    embeddings,
    assignments,
    clusters.length
  );

  return assignments.map((cluster, index) => ({
    index,
    clusterId: cluster,
    score:
      cluster >= 0
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
    const distances = embeddings.map((e) => {
      const minDist = Math.min(
        ...centroids.map((cent) => 1 - cosineSimilarity(e, cent))
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

    // Fallback: if we didn't pick any (can happen with all zeros)
    if (centroids.length <= c) {
      centroids.push([...embeddings[c % n]]);
    }
  }

  return centroids;
}

/**
 * Compute average of embeddings (centroid).
 */
export function averageEmbedding(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    return [];
  }

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
  if (norm === 0) {
    return avg;
  }
  return avg.map((v) => v / norm);
}

/** Maximum dataset size before memory warning */
const SIMILARITY_MATRIX_WARN_SIZE = 5000;

/**
 * Compute pairwise similarity matrix.
 *
 * MEMORY WARNING: This creates an O(n²) matrix.
 * - 1,000 points = ~8MB
 * - 5,000 points = ~200MB
 * - 10,000 points = ~800MB
 *
 * For very large datasets, consider using approximate methods.
 */
function computeSimilarityMatrix(embeddings: number[][]): number[][] {
  const n = embeddings.length;

  if (n > SIMILARITY_MATRIX_WARN_SIZE) {
    console.warn(
      `Computing similarity matrix for ${n} embeddings. ` +
        `This requires ~${Math.round((n * n * 8) / 1024 / 1024)}MB of memory. ` +
        `Consider using k-means for large datasets.`
    );
  }

  const matrix: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

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
  const threshold = 1 - epsilon; // Convert distance to similarity

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
  linkage: "single" | "complete" | "average"
): number {
  const sims: number[] = [];

  for (const i of cluster1) {
    for (const j of cluster2) {
      sims.push(similarities[i][j]);
    }
  }

  switch (linkage) {
    case "single":
      return Math.max(...sims);
    case "complete":
      return Math.min(...sims);
    case "average":
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
      centroids[c] = embeddings[0] || []; // Fallback
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

  const uniqueClusters = [...new Set(assignments.map((a) => a.clusterId))];
  if (uniqueClusters.length < 2) return 0;

  let totalScore = 0;
  let validPoints = 0;

  for (let i = 0; i < n; i++) {
    const cluster = assignments[i].clusterId;
    if (cluster < 0) continue; // Skip noise points

    // Calculate a(i): average distance to points in same cluster
    const sameCluster = assignments
      .filter((a) => a.clusterId === cluster && a.index !== i)
      .map((a) => a.index);

    if (sameCluster.length === 0) continue;

    const a =
      sameCluster
        .map((j) => 1 - cosineSimilarity(embeddings[i], embeddings[j]))
        .reduce((sum, d) => sum + d, 0) / sameCluster.length;

    // Calculate b(i): minimum average distance to points in other clusters
    let b = Infinity;
    for (const otherCluster of uniqueClusters) {
      if (otherCluster === cluster || otherCluster < 0) continue;

      const otherPoints = assignments
        .filter((a) => a.clusterId === otherCluster)
        .map((a) => a.index);

      if (otherPoints.length === 0) continue;

      const avgDist =
        otherPoints
          .map((j) => 1 - cosineSimilarity(embeddings[i], embeddings[j]))
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
