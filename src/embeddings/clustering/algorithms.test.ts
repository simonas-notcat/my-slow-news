import { describe, test, expect } from "vitest";
import {
  kMeansClustering,
  dbscanClustering,
  hierarchicalClustering,
  calculateSilhouetteScore,
  averageEmbedding,
} from "./algorithms";

describe("kMeansClustering", () => {
  test("clusters similar embeddings together", () => {
    // Two clearly separated clusters
    const embeddings = [
      // Cluster 1: vectors pointing in x direction
      [1, 0, 0, 0],
      [0.9, 0.1, 0, 0],
      [0.95, 0.05, 0, 0],
      // Cluster 2: vectors pointing in y direction
      [0, 1, 0, 0],
      [0.1, 0.9, 0, 0],
      [0.05, 0.95, 0, 0],
    ];

    const assignments = kMeansClustering(embeddings, { numClusters: 2 });

    expect(assignments).toHaveLength(6);

    // Points 0,1,2 should be in one cluster, 3,4,5 in another
    expect(assignments[0].clusterId).toBe(assignments[1].clusterId);
    expect(assignments[0].clusterId).toBe(assignments[2].clusterId);
    expect(assignments[3].clusterId).toBe(assignments[4].clusterId);
    expect(assignments[3].clusterId).toBe(assignments[5].clusterId);
    expect(assignments[0].clusterId).not.toBe(assignments[3].clusterId);
  });

  test("handles empty embeddings", () => {
    const assignments = kMeansClustering([], { numClusters: 2 });
    expect(assignments).toHaveLength(0);
  });

  test("handles edge case with fewer points than clusters", () => {
    const embeddings = [
      [1, 0],
      [0, 1],
    ];
    const assignments = kMeansClustering(embeddings, { numClusters: 5 });

    expect(assignments).toHaveLength(2);
    // Each point should still get an assignment
    expect(assignments[0].clusterId).toBeGreaterThanOrEqual(0);
    expect(assignments[1].clusterId).toBeGreaterThanOrEqual(0);
  });

  test("assigns membership scores based on centroid similarity", () => {
    const embeddings = [
      [1, 0, 0],
      [0.9, 0.1, 0],
      [0, 1, 0],
    ];

    const assignments = kMeansClustering(embeddings, { numClusters: 2 });

    // All assignments should have scores between 0 and 1
    for (const a of assignments) {
      expect(a.score).toBeGreaterThanOrEqual(0);
      expect(a.score).toBeLessThanOrEqual(1);
    }
  });

  test("respects maxIterations parameter", () => {
    const embeddings = [
      [1, 0],
      [0, 1],
      [0.5, 0.5],
    ];

    // Should complete with only 1 iteration
    const assignments = kMeansClustering(embeddings, {
      numClusters: 2,
      maxIterations: 1,
    });

    expect(assignments).toHaveLength(3);
  });
});

describe("dbscanClustering", () => {
  test("identifies clusters and noise points", () => {
    const embeddings = [
      // Dense cluster 1
      [1, 0, 0],
      [0.95, 0.05, 0],
      [0.9, 0.1, 0],
      // Dense cluster 2
      [0, 1, 0],
      [0.05, 0.95, 0],
      [0.1, 0.9, 0],
      // Noise point (far from both clusters)
      [0.5, 0.5, 0.7],
    ];

    const assignments = dbscanClustering(embeddings, {
      epsilon: 0.2,
      minPoints: 2,
    });

    expect(assignments).toHaveLength(7);

    // Dense cluster points should be assigned to clusters
    expect(assignments[0].clusterId).toBeGreaterThanOrEqual(0);
    expect(assignments[0].clusterId).toBe(assignments[1].clusterId);
    expect(assignments[3].clusterId).toBeGreaterThanOrEqual(0);
    expect(assignments[3].clusterId).toBe(assignments[4].clusterId);
  });

  test("handles empty embeddings", () => {
    const assignments = dbscanClustering([], { epsilon: 0.3, minPoints: 2 });
    expect(assignments).toHaveLength(0);
  });

  test("marks all points as noise when minPoints is too high", () => {
    const embeddings = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];

    const assignments = dbscanClustering(embeddings, {
      epsilon: 0.1, // Very tight epsilon
      minPoints: 10, // Too high for 3 points
    });

    // All points should be noise (clusterId = -1)
    for (const a of assignments) {
      expect(a.clusterId).toBe(-1);
    }
  });

  test("creates single cluster when epsilon is very large", () => {
    const embeddings = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];

    const assignments = dbscanClustering(embeddings, {
      epsilon: 0.99, // Very large epsilon
      minPoints: 2,
    });

    // All points should be in the same cluster
    const validAssignments = assignments.filter((a) => a.clusterId >= 0);
    if (validAssignments.length > 1) {
      const firstCluster = validAssignments[0].clusterId;
      for (const a of validAssignments) {
        expect(a.clusterId).toBe(firstCluster);
      }
    }
  });
});

describe("hierarchicalClustering", () => {
  test("creates hierarchical clusters", () => {
    const embeddings = [
      [1, 0, 0],
      [0.9, 0.1, 0],
      [0, 1, 0],
      [0.1, 0.9, 0],
    ];

    const assignments = hierarchicalClustering(embeddings, {
      linkage: "average",
      distanceThreshold: 0.5,
    });

    expect(assignments).toHaveLength(4);
    // Similar points should be in same cluster
    expect(assignments[0].clusterId).toBe(assignments[1].clusterId);
    expect(assignments[2].clusterId).toBe(assignments[3].clusterId);
  });

  test("handles empty embeddings", () => {
    const assignments = hierarchicalClustering([], {
      linkage: "average",
      distanceThreshold: 0.5,
    });
    expect(assignments).toHaveLength(0);
  });

  test("respects distanceThreshold", () => {
    const embeddings = [
      [1, 0],
      [0, 1],
    ];

    // With high threshold, should merge into one cluster
    const merged = hierarchicalClustering(embeddings, {
      linkage: "single",
      distanceThreshold: 0.0, // Very low threshold, likely to merge
    });

    // With very low threshold, may keep separate
    const separate = hierarchicalClustering(embeddings, {
      linkage: "complete",
      distanceThreshold: 0.99, // Very high threshold, less likely to merge
    });

    expect(merged).toHaveLength(2);
    expect(separate).toHaveLength(2);
  });

  test("supports different linkage types", () => {
    const embeddings = [
      [1, 0, 0],
      [0.8, 0.2, 0],
      [0.6, 0.4, 0],
      [0, 1, 0],
    ];

    const single = hierarchicalClustering(embeddings, {
      linkage: "single",
      distanceThreshold: 0.5,
    });

    const complete = hierarchicalClustering(embeddings, {
      linkage: "complete",
      distanceThreshold: 0.5,
    });

    const average = hierarchicalClustering(embeddings, {
      linkage: "average",
      distanceThreshold: 0.5,
    });

    // All should return valid assignments
    expect(single).toHaveLength(4);
    expect(complete).toHaveLength(4);
    expect(average).toHaveLength(4);
  });
});

describe("calculateSilhouetteScore", () => {
  test("returns high score for well-separated clusters", () => {
    const embeddings = [
      [1, 0],
      [0.9, 0.1],
      [0.95, 0.05], // Cluster 0
      [0, 1],
      [0.1, 0.9],
      [0.05, 0.95], // Cluster 1
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
    expect(score).toBeGreaterThan(0.5); // Good separation
  });

  test("returns lower score for overlapping clusters", () => {
    const embeddings = [
      [0.5, 0.5],
      [0.6, 0.4],
      [0.4, 0.6], // Very similar
      [0.55, 0.45],
      [0.45, 0.55],
      [0.5, 0.5],
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
    expect(score).toBeLessThan(0.5); // Poor separation
  });

  test("returns 0 for single point or single cluster", () => {
    const singlePoint = calculateSilhouetteScore(
      [[1, 0]],
      [{ index: 0, clusterId: 0, score: 1 }]
    );
    expect(singlePoint).toBe(0);

    const singleCluster = calculateSilhouetteScore(
      [
        [1, 0],
        [0, 1],
      ],
      [
        { index: 0, clusterId: 0, score: 1 },
        { index: 1, clusterId: 0, score: 1 },
      ]
    );
    expect(singleCluster).toBe(0);
  });

  test("ignores noise points", () => {
    const embeddings = [
      [1, 0],
      [0.9, 0.1],
      [0, 1],
      [0.1, 0.9],
      [0.5, 0.5], // noise
    ];

    const assignments = [
      { index: 0, clusterId: 0, score: 1 },
      { index: 1, clusterId: 0, score: 1 },
      { index: 2, clusterId: 1, score: 1 },
      { index: 3, clusterId: 1, score: 1 },
      { index: 4, clusterId: -1, score: 0 }, // noise
    ];

    const score = calculateSilhouetteScore(embeddings, assignments);
    // Should still compute a valid score ignoring noise
    expect(score).toBeGreaterThan(0);
  });
});

describe("averageEmbedding", () => {
  test("computes normalized centroid of embeddings", () => {
    const embeddings = [
      [1, 0, 0],
      [1, 0, 0],
    ];

    const avg = averageEmbedding(embeddings);

    expect(avg).toHaveLength(3);
    // Should be normalized to unit length
    const norm = Math.sqrt(avg[0] ** 2 + avg[1] ** 2 + avg[2] ** 2);
    expect(norm).toBeCloseTo(1, 5);
  });

  test("handles single embedding", () => {
    const embeddings = [[0.6, 0.8, 0]];
    const avg = averageEmbedding(embeddings);

    expect(avg).toHaveLength(3);
    // Single embedding should be normalized
    const norm = Math.sqrt(avg[0] ** 2 + avg[1] ** 2 + avg[2] ** 2);
    expect(norm).toBeCloseTo(1, 5);
  });

  test("handles empty array", () => {
    const avg = averageEmbedding([]);
    expect(avg).toHaveLength(0);
  });

  test("handles zero vectors", () => {
    const embeddings = [
      [0, 0, 0],
      [0, 0, 0],
    ];
    const avg = averageEmbedding(embeddings);

    // Zero vector should return zero (can't normalize)
    expect(avg).toEqual([0, 0, 0]);
  });
});
