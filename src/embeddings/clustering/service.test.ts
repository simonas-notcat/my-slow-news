import { describe, test, expect, vi, beforeEach } from "vitest";
import { ThemeClusteringService } from "./service";
import type Surreal from "surrealdb";
import type { ClaimRecord } from "../../types";

// Mock the theme-labeler module
const mockGenerateThemeLabels = vi.fn(() =>
  Promise.resolve([
    {
      name: "Test Theme",
      description: "A test theme",
      keywords: ["test", "theme"],
    },
  ])
);

// We need to mock at module level for Bun
// For now we'll test with actual labeler calls (will fallback to default labels)

describe("ThemeClusteringService", () => {
  const mockDb = {
    query: vi.fn(() => Promise.resolve([[]])),
  } as unknown as Surreal;

  let service: ThemeClusteringService;

  beforeEach(() => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockClear();
    service = new ThemeClusteringService(mockDb);
  });

  describe("clusterClaims", () => {
    test("returns empty result for insufficient claims", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([
          [{ id: "claim:1", embedding: [1, 0, 0], is_canonical: true }],
        ])
      );

      const result = await service.clusterClaims({
        algorithm: "kmeans",
        minClusterSize: 3,
      });

      expect(result.themes).toHaveLength(0);
      expect(result.unclustered.length).toBeGreaterThan(0);
      expect(result.stats.clusteredClaims).toBe(0);
    });

    test("returns empty result for empty claims", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      const result = await service.clusterClaims({
        algorithm: "kmeans",
        minClusterSize: 3,
      });

      expect(result.themes).toHaveLength(0);
      expect(result.assignments).toHaveLength(0);
      expect(result.unclustered).toHaveLength(0);
    });

    test("clusters claims using kmeans algorithm", async () => {
      const claims: ClaimRecord[] = [
        {
          id: "claim:1",
          subject: "Rust",
          predicate: "has",
          object: "ownership",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [1, 0, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:2",
          subject: "Rust",
          predicate: "has",
          object: "borrowing",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0.95, 0.05, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:3",
          subject: "Rust",
          predicate: "has",
          object: "lifetimes",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0.9, 0.1, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:4",
          subject: "Go",
          predicate: "has",
          object: "goroutines",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0, 1, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:5",
          subject: "Go",
          predicate: "has",
          object: "channels",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0.05, 0.95, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:6",
          subject: "Go",
          predicate: "has",
          object: "gc",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0.1, 0.9, 0, 0],
          is_canonical: true,
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([claims])
      );

      const result = await service.clusterClaims({
        algorithm: "kmeans",
        numClusters: 2,
        minClusterSize: 2,
      });

      // Should create themes
      expect(result.themes.length).toBeGreaterThan(0);
      expect(result.assignments.length).toBe(6);
      expect(result.stats.clusteredClaims).toBe(6);
      expect(result.stats.numThemes).toBeGreaterThan(0);
    });

    test("uses dbscan algorithm when specified", async () => {
      const claims: ClaimRecord[] = [
        {
          id: "claim:1",
          subject: "Rust",
          predicate: "has",
          object: "ownership",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [1, 0, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:2",
          subject: "Rust",
          predicate: "has",
          object: "borrowing",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0.95, 0.05, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:3",
          subject: "Rust",
          predicate: "has",
          object: "lifetimes",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0.9, 0.1, 0, 0],
          is_canonical: true,
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([claims])
      );

      const result = await service.clusterClaims({
        algorithm: "dbscan",
        epsilon: 0.3,
        minPoints: 2,
        minClusterSize: 2,
      });

      // DBSCAN should process the claims
      expect(result.stats.totalClaims).toBe(3);
    });

    test("uses hierarchical algorithm when specified", async () => {
      const claims: ClaimRecord[] = [
        {
          id: "claim:1",
          subject: "Rust",
          predicate: "has",
          object: "ownership",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [1, 0, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:2",
          subject: "Rust",
          predicate: "has",
          object: "borrowing",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0.95, 0.05, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:3",
          subject: "Rust",
          predicate: "has",
          object: "lifetimes",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0.9, 0.1, 0, 0],
          is_canonical: true,
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([claims])
      );

      const result = await service.clusterClaims({
        algorithm: "hierarchical",
        linkage: "average",
        distanceThreshold: 0.5,
        minClusterSize: 2,
      });

      expect(result.stats.totalClaims).toBe(3);
    });

    test("includes execution time in stats", async () => {
      const claims: ClaimRecord[] = [
        {
          id: "claim:1",
          subject: "Test",
          predicate: "has",
          object: "value",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [1, 0, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:2",
          subject: "Test",
          predicate: "has",
          object: "value2",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0.9, 0.1, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:3",
          subject: "Test",
          predicate: "has",
          object: "value3",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0.8, 0.2, 0, 0],
          is_canonical: true,
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([claims])
      );

      const result = await service.clusterClaims({
        algorithm: "kmeans",
        numClusters: 1,
        minClusterSize: 2,
      });

      expect(result.stats.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("saveClusteringResults", () => {
    test("saves themes to database", async () => {
      const result = {
        themes: [
          {
            id: "theme:1",
            name: "Test Theme",
            description: "A test",
            keywords: ["test"],
            centroid: [1, 0, 0],
            claimCount: 3,
            createdAt: new Date(),
            updatedAt: new Date(),
            isActive: true,
          },
        ],
        assignments: [
          {
            claimId: "claim:1",
            themeId: "theme:1",
            membershipScore: 0.9,
            assignedAt: new Date(),
          },
        ],
        unclustered: [],
        stats: {
          totalClaims: 1,
          clusteredClaims: 1,
          numThemes: 1,
          avgClusterSize: 1,
          executionTimeMs: 100,
        },
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementation(() =>
        Promise.resolve([[]])
      );

      await service.saveClusteringResults(result);

      // Should have called query for:
      // 1. BEGIN TRANSACTION
      // 2. Deactivate old themes (in parallel with 3)
      // 3. Delete old assignments (in parallel with 2)
      // 4. Batch create themes
      // 5. Batch create assignments
      // 6. COMMIT TRANSACTION
      expect(mockDb.query).toHaveBeenCalledTimes(6);

      // Verify transaction calls
      expect(mockDb.query).toHaveBeenNthCalledWith(1, "BEGIN TRANSACTION");
      expect(mockDb.query).toHaveBeenLastCalledWith("COMMIT TRANSACTION");
    });
  });

  describe("getThemes", () => {
    test("returns active themes sorted by claim count", async () => {
      const themes = [
        {
          id: "theme:1",
          name: "Rust Features",
          claimCount: 10,
          isActive: true,
          keywords: [],
          centroid: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "theme:2",
          name: "Go Concurrency",
          claimCount: 5,
          isActive: true,
          keywords: [],
          centroid: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([themes])
      );

      const result = await service.getThemes();

      expect(result).toHaveLength(2);
      expect(result[0].claimCount).toBeGreaterThan(result[1].claimCount);
    });

    test("returns empty array when no themes", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      const result = await service.getThemes();

      expect(result).toHaveLength(0);
    });
  });

  describe("getThemeWithClaims", () => {
    test("returns theme with its claims", async () => {
      const theme = {
        id: "theme:1",
        name: "Rust Features",
        description: "Claims about Rust language features",
        keywords: ["rust", "ownership", "safety"],
        claimCount: 3,
        centroid: [1, 0, 0],
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
      };

      const assignments = [
        {
          id: "claim:1",
          subject: "Rust",
          predicate: "has",
          object: "ownership",
          membershipScore: 0.95,
        },
        {
          id: "claim:2",
          subject: "Rust",
          predicate: "has",
          object: "borrowing",
          membershipScore: 0.9,
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[theme]]))
        .mockImplementationOnce(() => Promise.resolve([assignments]));

      const result = await service.getThemeWithClaims("theme:1");

      expect(result).not.toBeNull();
      expect(result!.name).toBe("Rust Features");
      expect(result!.claims).toHaveLength(2);
    });

    test("returns null for non-existent theme", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      const result = await service.getThemeWithClaims("theme:nonexistent");

      expect(result).toBeNull();
    });

    test("respects limit and offset", async () => {
      const theme = {
        id: "theme:1",
        name: "Test Theme",
        keywords: [],
        centroid: [],
        claimCount: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true,
      };

      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[theme]]))
        .mockImplementationOnce(() => Promise.resolve([[]]));

      await service.getThemeWithClaims("theme:1", { limit: 10, offset: 20 });

      // Check that query was called with limit and offset params
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("LIMIT"),
        expect.objectContaining({ limit: 10, offset: 20 })
      );
    });
  });

  describe("getClaimTheme", () => {
    test("returns theme for a claim", async () => {
      const result = [
        {
          theme: { id: "theme:1", name: "Rust Features" },
          membershipScore: 0.9,
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([result])
      );

      const theme = await service.getClaimTheme("claim:1");

      expect(theme).not.toBeNull();
      expect(theme!.name).toBe("Rust Features");
    });

    test("returns null for unclustered claim", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      const theme = await service.getClaimTheme("claim:unclustered");

      expect(theme).toBeNull();
    });
  });

  describe("searchThemes", () => {
    test("returns themes sorted by similarity", async () => {
      const themes = [
        {
          id: "theme:1",
          name: "Rust Memory",
          similarity: 0.9,
          claimCount: 10,
          keywords: [],
          centroid: [1, 0, 0],
          createdAt: new Date(),
          updatedAt: new Date(),
          isActive: true,
        },
        {
          id: "theme:2",
          name: "Go Concurrency",
          similarity: 0.7,
          claimCount: 5,
          keywords: [],
          centroid: [0, 1, 0],
          createdAt: new Date(),
          updatedAt: new Date(),
          isActive: true,
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([themes])
      );

      const result = await service.searchThemes([1, 0, 0], { limit: 10 });

      expect(result).toHaveLength(2);
      expect(result[0].similarity).toBeGreaterThan(result[1].similarity);
    });

    test("respects minSimilarity threshold", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      await service.searchThemes([1, 0, 0], { minSimilarity: 0.8 });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining(">="),
        expect.objectContaining({ minSimilarity: 0.8 })
      );
    });

    test("throws error for empty embedding array", async () => {
      await expect(service.searchThemes([])).rejects.toThrow(
        "queryEmbedding must be a non-empty array"
      );
    });

    test("throws error for invalid embedding values", async () => {
      await expect(
        service.searchThemes([1, NaN, 0] as number[])
      ).rejects.toThrow("must contain only valid numbers");
    });
  });

  describe("getStats", () => {
    test("returns stats with data", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() =>
          Promise.resolve([[{ total: 5, totalClaims: 50, avgSize: 10 }]])
        )
        .mockImplementationOnce(() =>
          Promise.resolve([[{ name: "Rust Features", claimCount: 20 }]])
        );

      const stats = await service.getStats();

      expect(stats.totalThemes).toBe(5);
      expect(stats.totalClustered).toBe(50);
      expect(stats.avgClusterSize).toBe(10);
      expect(stats.largestTheme).toEqual({ name: "Rust Features", count: 20 });
    });

    test("returns empty stats when no themes", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[]]))
        .mockImplementationOnce(() => Promise.resolve([[]]));

      const stats = await service.getStats();

      expect(stats.totalThemes).toBe(0);
      expect(stats.totalClustered).toBe(0);
      expect(stats.avgClusterSize).toBe(0);
      expect(stats.largestTheme).toBeUndefined();
    });
  });
});
