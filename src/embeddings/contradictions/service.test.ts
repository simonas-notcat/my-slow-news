import { describe, test, expect, vi, beforeEach } from "vitest";
import { ContradictionDetectionService } from "./service";
import type Surreal from "surrealdb";
import type { ClaimRecord } from "../../types";

describe("ContradictionDetectionService", () => {
  const mockDb = {
    query: vi.fn(() => Promise.resolve([[]])),
  } as unknown as Surreal;

  let service: ContradictionDetectionService;

  beforeEach(() => {
    (mockDb.query as ReturnType<typeof vi.fn>).mockClear();
    service = new ContradictionDetectionService(mockDb);
  });

  describe("detectContradictions", () => {
    test("detects direct contradictions with opposite predicates", async () => {
      const claims: ClaimRecord[] = [
        {
          id: "claim:1",
          subject: "Rust",
          predicate: "supports",
          object: "async",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [1, 0, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:2",
          subject: "Rust",
          predicate: "opposes",
          object: "async",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0.99, 0.1, 0, 0], // High similarity
          is_canonical: true,
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([claims])
      );

      const contradictions = await service.detectContradictions({
        useLlmVerification: false,
      });

      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].contradictionType).toBe("direct");
      expect(contradictions[0].confidence).toBeGreaterThan(0.9);
    });

    test("detects comparative reversals", async () => {
      const claims: ClaimRecord[] = [
        {
          id: "claim:1",
          subject: "Rust",
          predicate: "is-better-than",
          object: "C++",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [1, 0, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:2",
          subject: "C++",
          predicate: "is-better-than",
          object: "Rust",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0.95, 0.1, 0, 0],
          is_canonical: true,
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([claims])
      );

      const contradictions = await service.detectContradictions({
        useLlmVerification: false,
      });

      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].contradictionType).toBe("comparative");
    });

    test("returns empty array when no contradictions exist", async () => {
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
          subject: "Go",
          predicate: "has",
          object: "goroutines",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0, 1, 0, 0], // Low similarity
          is_canonical: true,
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([claims])
      );

      const contradictions = await service.detectContradictions({
        useLlmVerification: false,
      });

      expect(contradictions).toHaveLength(0);
    });

    test("returns empty array when insufficient claims", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([[{ id: "claim:1", embedding: [1, 0, 0, 0] }]])
      );

      const contradictions = await service.detectContradictions({
        useLlmVerification: false,
      });

      expect(contradictions).toHaveLength(0);
    });

    test("respects limit parameter", async () => {
      const claims: ClaimRecord[] = [];
      for (let i = 0; i < 10; i++) {
        claims.push({
          id: `claim:${i}`,
          subject: "A",
          predicate: i % 2 === 0 ? "supports" : "opposes",
          object: "B",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [1, 0, 0, 0], // All same embedding for high similarity
          is_canonical: true,
        });
      }

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([claims])
      );

      const contradictions = await service.detectContradictions({
        useLlmVerification: false,
        limit: 2,
      });

      expect(contradictions.length).toBeLessThanOrEqual(2);
    });
  });

  describe("findContradictionsFor", () => {
    test("finds contradictions for specific claim", async () => {
      const sourceClaim: ClaimRecord = {
        id: "claim:1",
        subject: "Rust",
        predicate: "is-safer-than",
        object: "C++",
        confidence: 0.9,
        extracted_at: new Date(),
        embedding: [1, 0, 0, 0],
        is_canonical: true,
      };

      const contradictingClaim: ClaimRecord & { similarity: number } = {
        id: "claim:2",
        subject: "C++",
        predicate: "is-safer-than",
        object: "Rust",
        confidence: 0.9,
        extracted_at: new Date(),
        similarity: 0.9,
        embedding: [0.95, 0.1, 0, 0],
        is_canonical: true,
      };

      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[sourceClaim]]))
        .mockImplementationOnce(() => Promise.resolve([[contradictingClaim]]));

      const contradictions = await service.findContradictionsFor("claim:1", {
        useLlmVerification: false,
      });

      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].claim2.id).toBe("claim:2");
      expect(contradictions[0].contradictionType).toBe("comparative");
    });

    test("throws when claim not found", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      await expect(
        service.findContradictionsFor("claim:nonexistent")
      ).rejects.toThrow("Claim not found");
    });

    test("throws when claim has no embedding", async () => {
      const claimWithoutEmbedding: ClaimRecord = {
        id: "claim:1",
        subject: "Test",
        predicate: "has",
        object: "something",
        confidence: 0.9,
        extracted_at: new Date(),
        is_canonical: true,
        // No embedding
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([[claimWithoutEmbedding]])
      );

      await expect(service.findContradictionsFor("claim:1")).rejects.toThrow(
        "no embedding"
      );
    });
  });

  describe("storeContradiction", () => {
    test("stores contradiction relationship", async () => {
      const contradiction = {
        claim1: { id: "claim:1", subject: "A", predicate: "has", object: "B" },
        claim2: { id: "claim:2", subject: "A", predicate: "lacks", object: "B" },
        similarity: 0.9,
        contradictionType: "negation" as const,
        confidence: 0.85,
        detectedAt: new Date(),
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      await service.storeContradiction(contradiction);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("RELATE"),
        expect.objectContaining({
          from: "claim:1",
          to: "claim:2",
          similarity: 0.9,
          type: "negation",
          confidence: 0.85,
        })
      );
    });

    test("stores explanation when provided", async () => {
      const contradiction = {
        claim1: { id: "claim:1", subject: "A", predicate: "supports", object: "B" },
        claim2: { id: "claim:2", subject: "A", predicate: "opposes", object: "B" },
        similarity: 0.95,
        contradictionType: "semantic" as const,
        confidence: 0.9,
        explanation: "These claims are semantically opposite",
        detectedAt: new Date(),
      };

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      await service.storeContradiction(contradiction);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("RELATE"),
        expect.objectContaining({
          explanation: "These claims are semantically opposite",
        })
      );
    });
  });

  describe("getStats", () => {
    test("returns stats with empty database", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[]]))
        .mockImplementationOnce(() => Promise.resolve([[]])) // typeStats
        .mockImplementationOnce(() => Promise.resolve([[]]))
        .mockImplementationOnce(() => Promise.resolve([[]]));

      const stats = await service.getStats();

      expect(stats.totalContradictions).toBe(0);
      expect(stats.byType.direct).toBe(0);
      expect(stats.byType.semantic).toBe(0);
      expect(stats.mostContestedSubjects).toEqual([]);
      expect(stats.mostContestedPredicates).toEqual([]);
    });

    test("returns stats with data", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => Promise.resolve([[{ total: 10 }]]))
        .mockImplementationOnce(() =>
          Promise.resolve([
            [
              { contradiction_type: "direct", count: 6 },
              { contradiction_type: "semantic", count: 4 },
            ],
          ])
        )
        .mockImplementationOnce(() =>
          Promise.resolve([
            [
              { subject: "Rust", count: 5 },
              { subject: "Go", count: 3 },
            ],
          ])
        )
        .mockImplementationOnce(() =>
          Promise.resolve([
            [
              { predicate: "is-better-than", count: 4 },
              { predicate: "supports", count: 3 },
            ],
          ])
        );

      const stats = await service.getStats();

      expect(stats.totalContradictions).toBe(10);
      expect(stats.byType.direct).toBe(6);
      expect(stats.byType.semantic).toBe(4);
      expect(stats.mostContestedSubjects).toHaveLength(2);
      expect(stats.mostContestedSubjects[0].subject).toBe("Rust");
      expect(stats.mostContestedPredicates).toHaveLength(2);
    });
  });

  describe("getStoredContradictions", () => {
    test("returns empty array when no contradictions stored", async () => {
      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      const contradictions = await service.getStoredContradictions();

      expect(contradictions).toHaveLength(0);
    });

    test("returns and formats stored contradictions", async () => {
      const stored = [
        {
          claim1_id: "claim:1",
          claim1_subject: "Rust",
          claim1_predicate: "is-safer-than",
          claim1_object: "C++",
          claim2_id: "claim:2",
          claim2_subject: "C++",
          claim2_predicate: "is-safer-than",
          claim2_object: "Rust",
          similarity: 0.9,
          contradiction_type: "comparative",
          confidence: 0.95,
          explanation: "Opposing comparative claims",
          detected_at: "2024-01-15T10:00:00Z",
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([stored])
      );

      const contradictions = await service.getStoredContradictions();

      expect(contradictions).toHaveLength(1);
      expect(contradictions[0].claim1.subject).toBe("Rust");
      expect(contradictions[0].claim2.subject).toBe("C++");
      expect(contradictions[0].contradictionType).toBe("comparative");
      expect(contradictions[0].explanation).toBe("Opposing comparative claims");
    });
  });

  describe("with LLM verification", () => {
    test("uses LLM verifier when provided", async () => {
      const mockLlmVerify = vi.fn(() =>
        Promise.resolve({
          isContradiction: true,
          confidence: 0.85,
          explanation: "LLM detected contradiction",
        })
      );

      const serviceWithLlm = new ContradictionDetectionService(
        mockDb,
        mockLlmVerify
      );

      const claims: ClaimRecord[] = [
        {
          id: "claim:1",
          subject: "TypeScript",
          predicate: "improves",
          object: "productivity",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [1, 0, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:2",
          subject: "TypeScript",
          predicate: "slows-down",
          object: "development",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0.9, 0.1, 0, 0], // High similarity
          is_canonical: true,
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([claims])
      );

      const contradictions = await serviceWithLlm.detectContradictions({
        useLlmVerification: true,
      });

      expect(mockLlmVerify).toHaveBeenCalled();
      expect(contradictions.length).toBeGreaterThan(0);
      expect(contradictions[0].contradictionType).toBe("semantic");
      expect(contradictions[0].explanation).toBe("LLM detected contradiction");
    });

    test("skips LLM verification when disabled", async () => {
      const mockLlmVerify = vi.fn(() =>
        Promise.resolve({
          isContradiction: true,
          confidence: 0.85,
          explanation: "LLM detected contradiction",
        })
      );

      const serviceWithLlm = new ContradictionDetectionService(
        mockDb,
        mockLlmVerify
      );

      const claims: ClaimRecord[] = [
        {
          id: "claim:1",
          subject: "TypeScript",
          predicate: "improves",
          object: "productivity",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [1, 0, 0, 0],
          is_canonical: true,
        },
        {
          id: "claim:2",
          subject: "TypeScript",
          predicate: "slows-down",
          object: "development",
          confidence: 0.9,
          extracted_at: new Date(),
          embedding: [0.9, 0.1, 0, 0],
          is_canonical: true,
        },
      ];

      (mockDb.query as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
        Promise.resolve([claims])
      );

      await serviceWithLlm.detectContradictions({
        useLlmVerification: false,
      });

      expect(mockLlmVerify).not.toHaveBeenCalled();
    });
  });
});
