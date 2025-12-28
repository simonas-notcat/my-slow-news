import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  cosineSimilarity,
  euclideanDistance,
  normalizeVector,
  findSimilarClaims,
} from "./similarity";
import type Surreal from "surrealdb";

describe("cosineSimilarity", () => {
  test("returns 1 for identical vectors", () => {
    const v = [1, 2, 3, 4];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  test("returns 1 for parallel vectors with different magnitudes", () => {
    const a = [1, 2, 3];
    const b = [2, 4, 6];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
  });

  test("returns 0 for orthogonal vectors", () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  test("returns -1 for opposite vectors", () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
  });

  test("handles normalized vectors correctly", () => {
    const a = normalizeVector([3, 4]); // [0.6, 0.8]
    const b = normalizeVector([4, 3]); // [0.8, 0.6]
    // cos(θ) = 0.6*0.8 + 0.8*0.6 = 0.96
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.96);
  });

  test("returns 0 for zero vectors", () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  test("throws error for different dimensions", () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(() => cosineSimilarity(a, b)).toThrow(
      "Embeddings must have same dimension",
    );
  });

  test("works with high-dimensional vectors", () => {
    const a = Array(1536)
      .fill(0)
      .map((_, i) => Math.sin(i));
    const b = Array(1536)
      .fill(0)
      .map((_, i) => Math.sin(i));
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
  });
});

describe("euclideanDistance", () => {
  test("returns 0 for identical vectors", () => {
    const v = [1, 2, 3, 4];
    expect(euclideanDistance(v, v)).toBe(0);
  });

  test("calculates correct distance for simple vectors", () => {
    const a = [0, 0];
    const b = [3, 4];
    expect(euclideanDistance(a, b)).toBe(5); // 3-4-5 triangle
  });

  test("calculates correct distance in 3D", () => {
    const a = [1, 2, 3];
    const b = [4, 6, 3];
    // sqrt((4-1)^2 + (6-2)^2 + (3-3)^2) = sqrt(9 + 16 + 0) = 5
    expect(euclideanDistance(a, b)).toBe(5);
  });

  test("throws error for different dimensions", () => {
    const a = [1, 2, 3];
    const b = [1, 2];
    expect(() => euclideanDistance(a, b)).toThrow(
      "Embeddings must have same dimension",
    );
  });

  test("is symmetric", () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    expect(euclideanDistance(a, b)).toBe(euclideanDistance(b, a));
  });
});

describe("normalizeVector", () => {
  test("normalizes to unit length", () => {
    const v = [3, 4]; // length 5
    const normalized = normalizeVector(v);

    // Check unit length
    const length = Math.sqrt(
      normalized.reduce((sum, x) => sum + x * x, 0),
    );
    expect(length).toBeCloseTo(1);

    // Check values
    expect(normalized[0]).toBeCloseTo(0.6);
    expect(normalized[1]).toBeCloseTo(0.8);
  });

  test("preserves direction", () => {
    const v = [1, 2, 3];
    const normalized = normalizeVector(v);

    // All components should have same relative proportions
    expect(normalized[1] / normalized[0]).toBeCloseTo(2);
    expect(normalized[2] / normalized[0]).toBeCloseTo(3);
  });

  test("handles already normalized vectors", () => {
    const v = [0.6, 0.8]; // Already unit length
    const normalized = normalizeVector(v);
    expect(normalized[0]).toBeCloseTo(0.6);
    expect(normalized[1]).toBeCloseTo(0.8);
  });

  test("handles zero vector", () => {
    const v = [0, 0, 0];
    const normalized = normalizeVector(v);
    expect(normalized).toEqual([0, 0, 0]);
  });

  test("does not modify original vector", () => {
    const v = [3, 4];
    normalizeVector(v);
    expect(v).toEqual([3, 4]);
  });
});

describe("findSimilarClaims", () => {
  let mockDb: Surreal;
  let mockQuery: ReturnType<typeof mock>;

  beforeEach(() => {
    mockQuery = mock(() => Promise.resolve([[]]));
    mockDb = {
      query: mockQuery,
    } as unknown as Surreal;
  });

  test("calls db.query with correct parameters", async () => {
    const embedding = [0.1, 0.2, 0.3];

    await findSimilarClaims(mockDb, embedding, {
      limit: 5,
      minSimilarity: 0.7,
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [query, params] = mockQuery.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];

    expect(query).toContain("vector::similarity::cosine");
    expect(query).toContain("FROM claim");
    expect(query).toContain("is_canonical = true");
    expect(params.embedding).toEqual(embedding);
    expect(params.limit).toBe(5);
  });

  test("filters results by minSimilarity", async () => {
    mockQuery.mockImplementation(() =>
      Promise.resolve([
        [
          {
            id: "claim:1",
            subject: "A",
            predicate: "has",
            object: "B",
            confidence: 0.9,
            extracted_at: new Date(),
            similarity: 0.95,
          },
          {
            id: "claim:2",
            subject: "C",
            predicate: "has",
            object: "D",
            confidence: 0.8,
            extracted_at: new Date(),
            similarity: 0.6,
          },
          {
            id: "claim:3",
            subject: "E",
            predicate: "has",
            object: "F",
            confidence: 0.7,
            extracted_at: new Date(),
            similarity: 0.4,
          },
        ],
      ]),
    );

    const results = await findSimilarClaims(mockDb, [0.1, 0.2], {
      minSimilarity: 0.5,
    });

    expect(results.length).toBe(2);
    expect(results[0].similarity).toBe(0.95);
    expect(results[1].similarity).toBe(0.6);
  });

  test("excludes specified claim IDs", async () => {
    await findSimilarClaims(mockDb, [0.1, 0.2], {
      excludeIds: ["claim:1", "claim:2"],
    });

    const [query] = mockQuery.mock.calls[0] as [string, Record<string, unknown>];
    expect(query).toContain("id NOT IN $excludeIds");
  });

  test("respects canonicalOnly option", async () => {
    await findSimilarClaims(mockDb, [0.1, 0.2], {
      canonicalOnly: false,
    });

    const [query] = mockQuery.mock.calls[0] as [string, Record<string, unknown>];
    expect(query).not.toContain("is_canonical");
  });

  test("returns empty array when no results", async () => {
    mockQuery.mockImplementation(() => Promise.resolve([[]]));

    const results = await findSimilarClaims(mockDb, [0.1, 0.2]);
    expect(results).toEqual([]);
  });

  test("uses default options when not specified", async () => {
    await findSimilarClaims(mockDb, [0.1, 0.2]);

    const [, params] = mockQuery.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(params.limit).toBe(10);
    expect(params.excludeIds).toEqual([]);
  });
});
