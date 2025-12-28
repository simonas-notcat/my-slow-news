import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  ClaimDeduplicationService,
  type DeduplicationConfig,
} from "./deduplication";
import type { EmbeddingService } from "./index";
import type Surreal from "surrealdb";
import type { ClaimRecord } from "../types";

describe("ClaimDeduplicationService", () => {
  // Mock embedding service
  let mockEmbeddingService: EmbeddingService;
  let mockEmbed: ReturnType<typeof mock>;
  let mockEmbedBatch: ReturnType<typeof mock>;

  // Mock database
  let mockDb: Surreal;
  let mockQuery: ReturnType<typeof mock>;

  const config: DeduplicationConfig = {
    duplicateThreshold: 0.92,
    relatedThreshold: 0.75,
  };

  beforeEach(() => {
    // Reset mocks
    mockEmbed = mock(() =>
      Promise.resolve({
        text: "test",
        embedding: [0.1, 0.2, 0.3, 0.4],
        model: "test-provider",
        cached: false,
      }),
    );

    mockEmbedBatch = mock(() =>
      Promise.resolve([
        {
          text: "test",
          embedding: [0.1, 0.2, 0.3, 0.4],
          model: "test-provider",
          cached: false,
        },
      ]),
    );

    mockEmbeddingService = {
      name: "test-provider",
      dimensions: 4,
      embed: mockEmbed,
      embedBatch: mockEmbedBatch,
    } as unknown as EmbeddingService;

    mockQuery = mock(() => Promise.resolve([[]]));
    mockDb = {
      query: mockQuery,
    } as unknown as Surreal;
  });

  describe("processNewClaim", () => {
    test("creates new canonical claim when no duplicates exist", async () => {
      const newClaimRecord: ClaimRecord = {
        id: "claim:new123",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.9,
        extracted_at: new Date(),
        is_canonical: true,
      };

      // Mock: no similar claims found, then CREATE returns new claim
      mockQuery
        .mockImplementationOnce(() => Promise.resolve([[]])) // findSimilarClaims
        .mockImplementationOnce(() => Promise.resolve([[newClaimRecord]])); // CREATE

      const service = new ClaimDeduplicationService(
        mockDb,
        mockEmbeddingService,
        config,
      );

      const result = await service.processNewClaim({
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.9,
      });

      expect(result.isNew).toBe(true);
      expect(result.claim.id).toBe("claim:new123");
      expect(result.claim.is_canonical).toBe(true);
      expect(result.duplicateOf).toBeUndefined();
      expect(mockEmbed).toHaveBeenCalledWith("Rust is safer than C++");
    });

    test("links to existing claim when duplicate found", async () => {
      const existingClaim: ClaimRecord = {
        id: "claim:existing123",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.8,
        extracted_at: new Date(),
        embedding: [0.1, 0.2, 0.3, 0.4],
        is_canonical: true,
      };

      const newClaimRecord: ClaimRecord = {
        id: "claim:dup456",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.95,
        extracted_at: new Date(),
        is_canonical: false,
        canonical_claim: "claim:existing123",
      };

      // Mock: similar claim found with high similarity
      mockQuery
        .mockImplementationOnce(() =>
          Promise.resolve([
            [
              {
                ...existingClaim,
                similarity: 0.95, // Above duplicate threshold
              },
            ],
          ]),
        ) // findSimilarClaims
        .mockImplementationOnce(() => Promise.resolve([[newClaimRecord]])) // CREATE non-canonical
        .mockImplementationOnce(() => Promise.resolve([[]])) // RELATE
        .mockImplementationOnce(() => Promise.resolve([[]])); // UPDATE confidence

      const service = new ClaimDeduplicationService(
        mockDb,
        mockEmbeddingService,
        config,
      );

      const result = await service.processNewClaim({
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.95,
      });

      expect(result.isNew).toBe(false);
      expect(result.duplicateOf).toBeDefined();
      expect(result.claim.id).toBe("claim:existing123");
      expect(result.relatedClaims).toEqual([]);

      // Verify that UPDATE was called to increase confidence
      const updateCall = mockQuery.mock.calls[3];
      expect(updateCall[0]).toContain("UPDATE");
    });

    test("creates related claims when similarity is between thresholds", async () => {
      const relatedClaim: ClaimRecord = {
        id: "claim:related789",
        subject: "Memory safety",
        predicate: "improves",
        object: "code quality",
        confidence: 0.85,
        extracted_at: new Date(),
        embedding: [0.15, 0.25, 0.35, 0.45],
        is_canonical: true,
      };

      const newClaimRecord: ClaimRecord = {
        id: "claim:new123",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.9,
        extracted_at: new Date(),
        is_canonical: true,
      };

      // Mock: related claim found (below duplicate, above related threshold)
      mockQuery
        .mockImplementationOnce(() =>
          Promise.resolve([
            [
              {
                ...relatedClaim,
                similarity: 0.8, // Between 0.75 (related) and 0.92 (duplicate)
              },
            ],
          ]),
        ) // findSimilarClaims
        .mockImplementationOnce(() => Promise.resolve([[newClaimRecord]])) // CREATE canonical
        .mockImplementationOnce(() => Promise.resolve([[]])); // RELATE related

      const service = new ClaimDeduplicationService(
        mockDb,
        mockEmbeddingService,
        config,
      );

      const result = await service.processNewClaim({
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.9,
      });

      expect(result.isNew).toBe(true);
      expect(result.claim.id).toBe("claim:new123");
      expect(result.relatedClaims).toHaveLength(1);
      expect(result.relatedClaims[0].similarity).toBe(0.8);
    });
  });

  describe("backfillEmbeddings", () => {
    test("processes claims in batches", async () => {
      const claimsWithoutEmbeddings: ClaimRecord[] = [
        {
          id: "claim:1",
          subject: "A",
          predicate: "has",
          object: "B",
          confidence: 0.8,
          extracted_at: new Date(),
          is_canonical: true,
        },
        {
          id: "claim:2",
          subject: "C",
          predicate: "has",
          object: "D",
          confidence: 0.9,
          extracted_at: new Date(),
          is_canonical: true,
        },
      ];

      mockQuery
        .mockImplementationOnce(() =>
          Promise.resolve([claimsWithoutEmbeddings]),
        ) // SELECT claims
        .mockImplementation(() => Promise.resolve([[]])); // UPDATE calls

      mockEmbedBatch.mockImplementationOnce(() =>
        Promise.resolve([
          {
            text: "A has B",
            embedding: [0.1, 0.2, 0.3, 0.4],
            model: "test-provider",
            cached: false,
          },
          {
            text: "C has D",
            embedding: [0.5, 0.6, 0.7, 0.8],
            model: "test-provider",
            cached: false,
          },
        ]),
      );

      const service = new ClaimDeduplicationService(
        mockDb,
        mockEmbeddingService,
        config,
      );

      const progressUpdates: number[] = [];
      const { processed, errors } = await service.backfillEmbeddings({
        batchSize: 10,
        onProgress: (done) => progressUpdates.push(done),
      });

      expect(processed).toBe(2);
      expect(errors).toBe(0);
      expect(mockEmbedBatch).toHaveBeenCalledWith(["A has B", "C has D"]);
    });

    test("returns zero counts when no claims need embedding", async () => {
      mockQuery.mockImplementationOnce(() => Promise.resolve([[]]));

      const service = new ClaimDeduplicationService(
        mockDb,
        mockEmbeddingService,
        config,
      );

      const { processed, errors } = await service.backfillEmbeddings();

      expect(processed).toBe(0);
      expect(errors).toBe(0);
    });

    test("counts errors when batch embedding fails", async () => {
      const claims: ClaimRecord[] = [
        {
          id: "claim:1",
          subject: "A",
          predicate: "has",
          object: "B",
          confidence: 0.8,
          extracted_at: new Date(),
          is_canonical: true,
        },
      ];

      mockQuery.mockImplementationOnce(() => Promise.resolve([claims]));

      mockEmbedBatch.mockImplementationOnce(() =>
        Promise.reject(new Error("API error")),
      );

      const service = new ClaimDeduplicationService(
        mockDb,
        mockEmbeddingService,
        config,
      );

      const { processed, errors } = await service.backfillEmbeddings();

      expect(processed).toBe(0);
      expect(errors).toBe(1);
    });
  });

  describe("detectExistingDuplicates", () => {
    test("finds duplicate pairs above threshold", async () => {
      // Two very similar claims and one different
      const claims: ClaimRecord[] = [
        {
          id: "claim:1",
          subject: "Rust",
          predicate: "is-safer-than",
          object: "C++",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [1, 0, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:2",
          subject: "Rust",
          predicate: "has-better-safety",
          object: "C++",
          confidence: 0.85,
          extracted_at: new Date(),
          embedding: [0.99, 0.1, 0, 0], // Very similar to claim:1
          is_canonical: true,
        },
        {
          id: "claim:3",
          subject: "Python",
          predicate: "is-slower-than",
          object: "C",
          confidence: 0.8,
          extracted_at: new Date(),
          embedding: [0, 0, 1, 0], // Different
          is_canonical: true,
        },
      ];

      mockQuery.mockImplementationOnce(() => Promise.resolve([claims]));

      const service = new ClaimDeduplicationService(
        mockDb,
        mockEmbeddingService,
        config,
      );

      const { duplicatePairs, truncated } =
        await service.detectExistingDuplicates();

      expect(truncated).toBe(false);
      // claim:1 and claim:2 should be detected as duplicates (similarity ~0.995)
      expect(duplicatePairs.length).toBe(1);
      expect(duplicatePairs[0].claim1.id).toBe("claim:1");
      expect(duplicatePairs[0].claim2.id).toBe("claim:2");
      expect(duplicatePairs[0].similarity).toBeGreaterThan(0.92);
    });

    test("returns empty when no duplicates exist", async () => {
      // Claims with orthogonal embeddings
      const claims: ClaimRecord[] = [
        {
          id: "claim:1",
          subject: "A",
          predicate: "has",
          object: "B",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [1, 0, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:2",
          subject: "C",
          predicate: "has",
          object: "D",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0, 1, 0, 0],
          is_canonical: true,
        },
      ];

      mockQuery.mockImplementationOnce(() => Promise.resolve([claims]));

      const service = new ClaimDeduplicationService(
        mockDb,
        mockEmbeddingService,
        config,
      );

      const { duplicatePairs } = await service.detectExistingDuplicates();

      expect(duplicatePairs).toHaveLength(0);
    });

    test("respects maxClaims limit and sets truncated flag", async () => {
      // Create more claims than maxClaims
      const claims = Array(101)
        .fill(null)
        .map((_, i) => ({
          id: `claim:${i}`,
          subject: `Subject${i}`,
          predicate: "has",
          object: `Object${i}`,
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [1, 0, 0, 0],
          is_canonical: true,
        }));

      mockQuery.mockImplementationOnce(() => Promise.resolve([claims]));

      const service = new ClaimDeduplicationService(
        mockDb,
        mockEmbeddingService,
        config,
      );

      const { truncated } = await service.detectExistingDuplicates({
        maxClaims: 100,
      });

      expect(truncated).toBe(true);
    });

    test("skips claims without embeddings", async () => {
      const claims: ClaimRecord[] = [
        {
          id: "claim:1",
          subject: "A",
          predicate: "has",
          object: "B",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [1, 0, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:2",
          subject: "C",
          predicate: "has",
          object: "D",
          confidence: 0.9,
          extracted_at: new Date(),
          // No embedding
          is_canonical: true,
        },
      ];

      mockQuery.mockImplementationOnce(() => Promise.resolve([claims]));

      const service = new ClaimDeduplicationService(
        mockDb,
        mockEmbeddingService,
        config,
      );

      const { duplicatePairs } = await service.detectExistingDuplicates();

      // Should not crash and should return empty (no valid pairs)
      expect(duplicatePairs).toHaveLength(0);
    });
  });

  describe("getStats", () => {
    test("returns embedding statistics", async () => {
      mockQuery.mockImplementationOnce(() =>
        Promise.resolve([
          [
            {
              total: 100,
              with_embedding: 80,
              canonical: 75,
              duplicates: 25,
            },
          ],
        ]),
      );

      const service = new ClaimDeduplicationService(
        mockDb,
        mockEmbeddingService,
        config,
      );

      const stats = await service.getStats();

      expect(stats.total).toBe(100);
      expect(stats.withEmbedding).toBe(80);
      expect(stats.canonical).toBe(75);
      expect(stats.duplicates).toBe(25);
    });

    test("returns zeros when no claims exist", async () => {
      mockQuery.mockImplementationOnce(() => Promise.resolve([[]]));

      const service = new ClaimDeduplicationService(
        mockDb,
        mockEmbeddingService,
        config,
      );

      const stats = await service.getStats();

      expect(stats.total).toBe(0);
      expect(stats.withEmbedding).toBe(0);
      expect(stats.canonical).toBe(0);
      expect(stats.duplicates).toBe(0);
    });
  });

  describe("mergeDuplicate", () => {
    test("merges duplicate into canonical claim", async () => {
      const duplicateClaim: ClaimRecord = {
        id: "claim:dup",
        subject: "A",
        predicate: "has",
        object: "B",
        confidence: 0.8,
        extracted_at: new Date(),
        embedding: [0.1, 0.2, 0.3, 0.4],
        is_canonical: true,
      };

      const canonicalClaim: ClaimRecord = {
        id: "claim:canonical",
        subject: "A",
        predicate: "has",
        object: "B",
        confidence: 0.9,
        extracted_at: new Date(),
        embedding: [0.1, 0.2, 0.3, 0.4],
        is_canonical: true,
      };

      mockQuery
        .mockImplementationOnce(() =>
          Promise.resolve([[duplicateClaim, canonicalClaim]]),
        ) // SELECT both claims
        .mockImplementationOnce(() => Promise.resolve([[]])) // UPDATE duplicate
        .mockImplementationOnce(() => Promise.resolve([[]])) // RELATE
        .mockImplementationOnce(() => Promise.resolve([[]])); // UPDATE stances

      const service = new ClaimDeduplicationService(
        mockDb,
        mockEmbeddingService,
        config,
      );

      await service.mergeDuplicate("claim:dup", "claim:canonical");

      // Verify UPDATE was called to mark as non-canonical
      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain("is_canonical = false");

      // Verify RELATE was called
      const relateCall = mockQuery.mock.calls[2];
      expect(relateCall[0]).toContain("claim_similarity");
    });

    test("throws error when claims not found", async () => {
      mockQuery.mockImplementationOnce(() => Promise.resolve([[]])); // No claims found

      const service = new ClaimDeduplicationService(
        mockDb,
        mockEmbeddingService,
        config,
      );

      await expect(
        service.mergeDuplicate("claim:dup", "claim:canonical"),
      ).rejects.toThrow("One or both claims not found");
    });

    test("skips stance merge when mergeStances is false", async () => {
      const duplicateClaim: ClaimRecord = {
        id: "claim:dup",
        subject: "A",
        predicate: "has",
        object: "B",
        confidence: 0.8,
        extracted_at: new Date(),
        embedding: [0.1, 0.2, 0.3, 0.4],
        is_canonical: true,
      };

      const canonicalClaim: ClaimRecord = {
        id: "claim:canonical",
        subject: "A",
        predicate: "has",
        object: "B",
        confidence: 0.9,
        extracted_at: new Date(),
        embedding: [0.1, 0.2, 0.3, 0.4],
        is_canonical: true,
      };

      mockQuery
        .mockImplementationOnce(() =>
          Promise.resolve([[duplicateClaim, canonicalClaim]]),
        )
        .mockImplementationOnce(() => Promise.resolve([[]]))
        .mockImplementationOnce(() => Promise.resolve([[]]));

      const service = new ClaimDeduplicationService(
        mockDb,
        mockEmbeddingService,
        config,
      );

      await service.mergeDuplicate("claim:dup", "claim:canonical", false);

      // Should only have 3 calls (SELECT, UPDATE, RELATE) - no stance update
      expect(mockQuery).toHaveBeenCalledTimes(3);
    });
  });
});
