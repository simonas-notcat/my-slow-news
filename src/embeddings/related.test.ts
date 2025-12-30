import { describe, test, expect, vi, beforeEach } from "vitest";
import { RelatedClaimsService } from "./related";
import type Surreal from "surrealdb";
import type { ClaimRecord } from "../types";

describe("RelatedClaimsService", () => {
  const mockDb = {
    query: vi.fn(() => Promise.resolve([[]])),
  } as unknown as Surreal;

  let service: RelatedClaimsService;

  beforeEach(() => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockClear();
    service = new RelatedClaimsService(mockDb);
  });

  describe("findRelated", () => {
    test("throws when claim not found", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      await expect(service.findRelated("claim:nonexistent")).rejects.toThrow(
        "Claim not found: claim:nonexistent"
      );
    });

    test("finds semantically related claims with embeddings", async () => {
      const sourceClaim: ClaimRecord = {
        id: "claim:1",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.9,
        extracted_at: new Date(),
        embedding: [0.1, 0.2, 0.3, 0.4],
        is_canonical: true,
      };

      const relatedClaims = [
        {
          id: "claim:2",
          subject: "C++",
          predicate: "has",
          object: "memory-bugs",
          confidence: 0.85,
          extracted_at: new Date(),
          similarity: 0.85,
        },
        {
          id: "claim:3",
          subject: "Go",
          predicate: "is-safer-than",
          object: "C",
          confidence: 0.8,
          extracted_at: new Date(),
          similarity: 0.75,
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]])) // Source claim
        .mockImplementationOnce(() => Promise.resolve([[]])) // Duplicates
        .mockImplementationOnce(() => Promise.resolve([relatedClaims])); // Related

      const results = await service.findRelated("claim:1");

      expect(results).toHaveLength(2);
      expect(results[0].similarity).toBe(0.85);
    });

    test("falls back to structural similarity without embeddings", async () => {
      const sourceClaim: ClaimRecord = {
        id: "claim:1",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.9,
        extracted_at: new Date(),
        is_canonical: true,
        // No embedding
      };

      const sameSubjectClaims: ClaimRecord[] = [
        {
          id: "claim:2",
          subject: "Rust",
          predicate: "has",
          object: "ownership",
          confidence: 0.8,
          extracted_at: new Date(),
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]]))
        .mockImplementationOnce(() => Promise.resolve([sameSubjectClaims])) // Same subject
        .mockImplementationOnce(() => Promise.resolve([[]])) // Same predicate
        .mockImplementationOnce(() => Promise.resolve([[]])); // Same object

      const results = await service.findRelated("claim:1");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].relationship).toBe("same-subject");
      expect(results[0].similarity).toBe(0.7); // Estimated similarity for same subject
    });

    test("excludes duplicate claims by default", async () => {
      const sourceClaim: ClaimRecord = {
        id: "claim:1",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.9,
        extracted_at: new Date(),
        embedding: [0.1, 0.2, 0.3, 0.4],
        is_canonical: true,
      };

      const duplicates = [{ id: "claim:dup" }];

      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]]))
        .mockImplementationOnce(() => Promise.resolve([duplicates]))
        .mockImplementationOnce(() => Promise.resolve([[]]));

      await service.findRelated("claim:1", { excludeDuplicates: true });

      // Verify duplicates were excluded in the query
      const queryCall = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[2];
      expect(queryCall[1].excludeIds).toContain("claim:dup");
    });

    test("respects limit parameter", async () => {
      const sourceClaim: ClaimRecord = {
        id: "claim:1",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.9,
        extracted_at: new Date(),
        embedding: [0.1, 0.2, 0.3, 0.4],
        is_canonical: true,
      };

      const manyRelatedClaims = Array(20)
        .fill(null)
        .map((_, i) => ({
          id: `claim:${i + 2}`,
          subject: `Subject${i}`,
          predicate: "has",
          object: `object${i}`,
          confidence: 0.8,
          extracted_at: new Date(),
          similarity: 0.9 - i * 0.01,
        }));

      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]]))
        .mockImplementationOnce(() => Promise.resolve([[]]))
        .mockImplementationOnce(() => Promise.resolve([manyRelatedClaims]));

      const results = await service.findRelated("claim:1", { limit: 5 });

      expect(results.length).toBeLessThanOrEqual(5);
    });

    test("respects minSimilarity parameter", async () => {
      const sourceClaim: ClaimRecord = {
        id: "claim:1",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.9,
        extracted_at: new Date(),
        embedding: [0.1, 0.2, 0.3, 0.4],
        is_canonical: true,
      };

      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]]))
        .mockImplementationOnce(() => Promise.resolve([[]]))
        .mockImplementationOnce(() => Promise.resolve([[]]));

      await service.findRelated("claim:1", { minSimilarity: 0.8 });

      // Verify minSimilarity was passed to the query
      const queryCall = (mockDb.query as ReturnType<typeof vi.fn>).mock.calls[2];
      expect(queryCall[1].minSimilarity).toBe(0.8);
    });
  });

  describe("findRelatedGrouped", () => {
    test("groups claims by relationship type", async () => {
      const sourceClaim: ClaimRecord = {
        id: "claim:1",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.9,
        extracted_at: new Date(),
        embedding: [0.1, 0.2, 0.3, 0.4],
        is_canonical: true,
      };

      const relatedClaims = [
        {
          id: "claim:2",
          subject: "Rust",
          predicate: "has",
          object: "ownership",
          confidence: 0.8,
          extracted_at: new Date(),
          similarity: 0.8,
        }, // same-subject
        {
          id: "claim:3",
          subject: "Go",
          predicate: "is-safer-than",
          object: "C",
          confidence: 0.75,
          extracted_at: new Date(),
          similarity: 0.75,
        }, // same-predicate
        {
          id: "claim:4",
          subject: "Zig",
          predicate: "compiles-to",
          object: "C++",
          confidence: 0.7,
          extracted_at: new Date(),
          similarity: 0.7,
        }, // same-object
        {
          id: "claim:5",
          subject: "Python",
          predicate: "uses",
          object: "GC",
          confidence: 0.65,
          extracted_at: new Date(),
          similarity: 0.65,
        }, // similar
      ];

      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]]))
        .mockImplementationOnce(() => Promise.resolve([[]]))
        .mockImplementationOnce(() => Promise.resolve([relatedClaims]));

      const grouped = await service.findRelatedGrouped("claim:1");

      expect(grouped.sameSubject.length).toBeGreaterThan(0);
      expect(grouped.samePredicate.length).toBeGreaterThan(0);
      expect(grouped.sameObject.length).toBeGreaterThan(0);
      expect(grouped.similar.length).toBeGreaterThan(0);
    });

    test("limits each group separately", async () => {
      const sourceClaim: ClaimRecord = {
        id: "claim:1",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.9,
        extracted_at: new Date(),
        embedding: [0.1, 0.2, 0.3, 0.4],
        is_canonical: true,
      };

      // Create many claims with same subject
      const manyRelatedClaims = Array(20)
        .fill(null)
        .map((_, i) => ({
          id: `claim:${i + 2}`,
          subject: "Rust", // All same subject
          predicate: `predicate${i}`,
          object: `object${i}`,
          confidence: 0.8,
          extracted_at: new Date(),
          similarity: 0.9 - i * 0.01,
        }));

      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]]))
        .mockImplementationOnce(() => Promise.resolve([[]]))
        .mockImplementationOnce(() => Promise.resolve([manyRelatedClaims]));

      const grouped = await service.findRelatedGrouped("claim:1", { limit: 8 });

      // perGroupLimit = ceil(8/4) = 2
      expect(grouped.sameSubject.length).toBeLessThanOrEqual(2);
    });
  });

  describe("categorizeRelationship", () => {
    test("correctly identifies same-subject", () => {
      // @ts-ignore - accessing private method for testing
      const result = service.categorizeRelationship(
        { subject: "Rust", predicate: "has", object: "ownership" } as ClaimRecord,
        { subject: "Rust", predicate: "is", object: "fast" } as ClaimRecord
      );
      expect(result).toBe("same-subject");
    });

    test("correctly identifies same-predicate", () => {
      // @ts-ignore
      const result = service.categorizeRelationship(
        {
          subject: "Rust",
          predicate: "is-safer-than",
          object: "C++",
        } as ClaimRecord,
        { subject: "Go", predicate: "is-safer-than", object: "C" } as ClaimRecord
      );
      expect(result).toBe("same-predicate");
    });

    test("correctly identifies same-object", () => {
      // @ts-ignore
      const result = service.categorizeRelationship(
        {
          subject: "Rust",
          predicate: "compiles-to",
          object: "binary",
        } as ClaimRecord,
        { subject: "Go", predicate: "produces", object: "binary" } as ClaimRecord
      );
      expect(result).toBe("same-object");
    });

    test("defaults to similar for no structural match", () => {
      // @ts-ignore
      const result = service.categorizeRelationship(
        { subject: "Rust", predicate: "has", object: "ownership" } as ClaimRecord,
        {
          subject: "Go",
          predicate: "uses",
          object: "garbage-collection",
        } as ClaimRecord
      );
      expect(result).toBe("similar");
    });
  });

  describe("precomputeRelated", () => {
    test("processes claims with concurrency limit", async () => {
      const claimIds = ["claim:1", "claim:2", "claim:3", "claim:4", "claim:5"];
      const mockClaim: ClaimRecord = {
        id: "claim:1",
        subject: "Test",
        predicate: "has",
        object: "value",
        confidence: 0.8,
        extracted_at: new Date(),
        embedding: [0.1, 0.2],
        is_canonical: true,
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementation(() =>
        Promise.resolve([[mockClaim]])
      );

      const results = await service.precomputeRelated(claimIds, {
        concurrencyLimit: 2,
      });

      expect(results.size).toBe(5);
    });

    test("handles errors gracefully in batch", async () => {
      const claimIds = ["claim:1", "claim:error", "claim:3"];

      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() =>
          Promise.resolve([
            [
              {
                id: "claim:1",
                subject: "Test",
                predicate: "has",
                object: "value",
                confidence: 0.8,
                extracted_at: new Date(),
                embedding: [0.1],
                is_canonical: true,
              },
            ],
          ])
        )
        .mockImplementationOnce(() => Promise.resolve([[]]))
        .mockImplementationOnce(() => Promise.resolve([[]]))
        .mockImplementationOnce(() => Promise.reject(new Error("Not found")))
        .mockImplementationOnce(() =>
          Promise.resolve([
            [
              {
                id: "claim:3",
                subject: "Test",
                predicate: "has",
                object: "value",
                confidence: 0.8,
                extracted_at: new Date(),
                embedding: [0.1],
                is_canonical: true,
              },
            ],
          ])
        )
        .mockImplementation(() => Promise.resolve([[]]));

      const results = await service.precomputeRelated(claimIds, {
        concurrencyLimit: 1,
      });

      expect(results.size).toBe(3);
      expect(results.get("claim:error")).toEqual([]); // Error case returns empty array
    });

    test("respects default concurrency limit of 5", async () => {
      const claimIds = Array(10)
        .fill(null)
        .map((_, i) => `claim:${i}`);

      const mockClaim: ClaimRecord = {
        id: "claim:0",
        subject: "Test",
        predicate: "has",
        object: "value",
        confidence: 0.8,
        extracted_at: new Date(),
        embedding: [0.1],
        is_canonical: true,
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementation(() =>
        Promise.resolve([[mockClaim]])
      );

      const results = await service.precomputeRelated(claimIds);

      expect(results.size).toBe(10);
    });
  });

  describe("validateClaimId", () => {
    test("rejects empty claim ID", async () => {
      await expect(service.findRelated("")).rejects.toThrow(
        "Claim ID is required"
      );
    });

    test("rejects invalid claim ID format", async () => {
      await expect(service.findRelated("invalid-id")).rejects.toThrow(
        "Invalid claim ID format"
      );
    });

    test("accepts valid claim ID format", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      // Should throw "Claim not found" not "Invalid claim ID format"
      await expect(service.findRelated("claim:valid-id")).rejects.toThrow(
        "Claim not found"
      );
    });
  });

  describe("error handling", () => {
    test("throws for non-existent claim", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      ); // No claim found

      await expect(service.findRelated("claim:nonexistent")).rejects.toThrow(
        "Claim not found: claim:nonexistent"
      );
    });

    test("handles database query failure", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.reject(new Error("Database error"))
      );

      await expect(service.findRelated("claim:1")).rejects.toThrow(
        "Database error"
      );
    });

    test("handles empty embedding gracefully", async () => {
      const claimWithoutEmbedding: ClaimRecord = {
        id: "claim:1",
        subject: "Rust",
        predicate: "has",
        object: "ownership",
        confidence: 0.9,
        extracted_at: new Date(),
        is_canonical: true,
        // No embedding field
      };

      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[claimWithoutEmbedding]]))
        .mockImplementation(() => Promise.resolve([[]])); // Structural search returns empty

      const results = await service.findRelated("claim:1");

      // Should fall back to structural similarity
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("structural similarity fallback", () => {
    test("finds same-subject claims", async () => {
      const sourceClaim: ClaimRecord = {
        id: "claim:1",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.9,
        extracted_at: new Date(),
        is_canonical: true,
      };

      const sameSubjectClaims: ClaimRecord[] = [
        {
          id: "claim:2",
          subject: "Rust",
          predicate: "has",
          object: "ownership",
          confidence: 0.8,
          extracted_at: new Date(),
        },
        {
          id: "claim:3",
          subject: "Rust",
          predicate: "compiles-to",
          object: "binary",
          confidence: 0.75,
          extracted_at: new Date(),
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]]))
        .mockImplementationOnce(() => Promise.resolve([sameSubjectClaims]))
        .mockImplementationOnce(() => Promise.resolve([[]]))
        .mockImplementationOnce(() => Promise.resolve([[]]));

      const results = await service.findRelated("claim:1");

      expect(results.length).toBe(2);
      expect(results.every((r) => r.relationship === "same-subject")).toBe(true);
    });

    test("finds same-predicate claims", async () => {
      const sourceClaim: ClaimRecord = {
        id: "claim:1",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.9,
        extracted_at: new Date(),
        is_canonical: true,
      };

      const samePredicateClaims: ClaimRecord[] = [
        {
          id: "claim:2",
          subject: "Go",
          predicate: "is-safer-than",
          object: "C",
          confidence: 0.8,
          extracted_at: new Date(),
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]]))
        .mockImplementationOnce(() => Promise.resolve([[]]))
        .mockImplementationOnce(() => Promise.resolve([samePredicateClaims]))
        .mockImplementationOnce(() => Promise.resolve([[]]));

      const results = await service.findRelated("claim:1");

      expect(results.length).toBe(1);
      expect(results[0].relationship).toBe("same-predicate");
    });

    test("avoids duplicate entries in structural results", async () => {
      const sourceClaim: ClaimRecord = {
        id: "claim:1",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.9,
        extracted_at: new Date(),
        is_canonical: true,
      };

      // Same claim appears in both subject and predicate results
      const duplicateClaim: ClaimRecord = {
        id: "claim:2",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C",
        confidence: 0.8,
        extracted_at: new Date(),
      };

      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]]))
        .mockImplementationOnce(() => Promise.resolve([[duplicateClaim]]))
        .mockImplementationOnce(() => Promise.resolve([[duplicateClaim]]))
        .mockImplementationOnce(() => Promise.resolve([[]]));

      const results = await service.findRelated("claim:1");

      // Should only appear once (as same-subject, since that's checked first)
      expect(results.length).toBe(1);
      expect(results[0].claim.id).toBe("claim:2");
    });
  });
});
