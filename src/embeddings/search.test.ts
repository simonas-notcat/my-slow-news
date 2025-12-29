import { describe, test, expect, mock, beforeEach } from "bun:test";
import { SemanticSearchService } from "./search";
import type { EmbeddingService } from "./index";
import type Surreal from "surrealdb";

describe("SemanticSearchService", () => {
  const mockEmbeddingService = {
    name: "test",
    dimensions: 4,
    embed: mock(() =>
      Promise.resolve({
        text: "test query",
        embedding: [0.1, 0.2, 0.3, 0.4],
        model: "test",
        cached: false,
      })
    ),
    embedBatch: mock(() => Promise.resolve([])),
  } as unknown as EmbeddingService;

  const mockDb = {
    query: mock(() => Promise.resolve([[]])),
  } as unknown as Surreal;

  let service: SemanticSearchService;

  beforeEach(() => {
    (mockDb.query as ReturnType<typeof mock>).mockClear();
    (mockEmbeddingService.embed as ReturnType<typeof mock>).mockClear();
    service = new SemanticSearchService(mockDb, mockEmbeddingService);
    service.resetRateLimit();
  });

  describe("search", () => {
    test("embeds query and searches database", async () => {
      const mockResults = [
        {
          id: "claim:1",
          subject: "Rust",
          predicate: "is-safer-than",
          object: "C++",
          confidence: 0.9,
          extracted_at: new Date(),
          similarity: 0.9,
        },
        {
          id: "claim:2",
          subject: "Go",
          predicate: "has",
          object: "fast-compilation",
          confidence: 0.85,
          extracted_at: new Date(),
          similarity: 0.8,
        },
      ];
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([mockResults])
      );

      const results = await service.search("memory safety");

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith("memory safety");
      expect(results).toHaveLength(2);
      expect(results[0].similarity).toBe(0.9);
      expect(results[0].claim.subject).toBe("Rust");
    });

    test("applies predicate filter", async () => {
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      await service.search("test", { filters: { predicate: "is-safer-than" } });

      const queryCall = (mockDb.query as ReturnType<typeof mock>).mock.calls[0];
      expect(queryCall[0]).toContain("predicate = $predicate");
      expect(queryCall[1].predicate).toBe("is-safer-than");
    });

    test("applies days filter", async () => {
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      await service.search("test", { filters: { days: 7 } });

      const queryCall = (mockDb.query as ReturnType<typeof mock>).mock.calls[0];
      expect(queryCall[0]).toContain("extracted_at >= $cutoff");
      expect(queryCall[1].cutoff).toBeDefined();
    });

    test("respects minimum similarity threshold", async () => {
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      await service.search("test", { minSimilarity: 0.7 });

      const queryCall = (mockDb.query as ReturnType<typeof mock>).mock.calls[0];
      expect(queryCall[1].minSimilarity).toBe(0.7);
    });

    test("respects limit parameter", async () => {
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      await service.search("test", { limit: 5 });

      const queryCall = (mockDb.query as ReturnType<typeof mock>).mock.calls[0];
      expect(queryCall[1].limit).toBe(5);
    });

    test("filters canonical claims by default", async () => {
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      await service.search("test");

      const queryCall = (mockDb.query as ReturnType<typeof mock>).mock.calls[0];
      expect(queryCall[0]).toContain("is_canonical = true");
    });

    test("can include non-canonical claims", async () => {
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      await service.search("test", { includeCanonicalOnly: false });

      const queryCall = (mockDb.query as ReturnType<typeof mock>).mock.calls[0];
      expect(queryCall[0]).not.toContain("is_canonical = true");
    });

    test("trims whitespace from query", async () => {
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      await service.search("  test query  ");

      expect(mockEmbeddingService.embed).toHaveBeenCalledWith("test query");
    });
  });

  describe("getSuggestions", () => {
    test("returns unique subjects from search results", async () => {
      const mockResults = [
        {
          id: "claim:1",
          subject: "Rust",
          predicate: "is-safer-than",
          object: "C++",
          confidence: 0.9,
          extracted_at: new Date(),
          similarity: 0.9,
        },
        {
          id: "claim:2",
          subject: "Rust",
          predicate: "has",
          object: "ownership",
          confidence: 0.85,
          extracted_at: new Date(),
          similarity: 0.85,
        },
        {
          id: "claim:3",
          subject: "Go",
          predicate: "is-faster-than",
          object: "Python",
          confidence: 0.8,
          extracted_at: new Date(),
          similarity: 0.8,
        },
      ];
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([mockResults])
      );

      const suggestions = await service.getSuggestions("programming");

      expect(suggestions).toEqual(["Rust", "Go"]);
    });

    test("respects limit parameter", async () => {
      const mockResults = [
        { id: "claim:1", subject: "Rust", similarity: 0.9, confidence: 0.9, extracted_at: new Date() },
        { id: "claim:2", subject: "Go", similarity: 0.8, confidence: 0.8, extracted_at: new Date() },
        { id: "claim:3", subject: "TypeScript", similarity: 0.7, confidence: 0.7, extracted_at: new Date() },
        { id: "claim:4", subject: "Python", similarity: 0.6, confidence: 0.6, extracted_at: new Date() },
      ];
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([mockResults])
      );

      const suggestions = await service.getSuggestions("lang", 2);

      expect(suggestions.length).toBe(2);
    });
  });

  describe("input validation", () => {
    test("rejects empty query", async () => {
      await expect(service.search("")).rejects.toThrow("at least 2 characters");
    });

    test("rejects whitespace-only query", async () => {
      await expect(service.search("   ")).rejects.toThrow(
        "at least 2 characters"
      );
    });

    test("rejects single character query", async () => {
      await expect(service.search("a")).rejects.toThrow(
        "at least 2 characters"
      );
    });

    test("rejects query exceeding max length", async () => {
      const longQuery = "a".repeat(501);
      await expect(service.search(longQuery)).rejects.toThrow(
        "at most 500 characters"
      );
    });

    test("accepts query at max length", async () => {
      const maxQuery = "a".repeat(500);
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      // Should not throw
      await service.search(maxQuery);
    });

    test("rejects invalid days filter - zero", async () => {
      await expect(
        service.search("test", { filters: { days: 0 } })
      ).rejects.toThrow("between 1 and 365");
    });

    test("rejects invalid days filter - negative", async () => {
      await expect(
        service.search("test", { filters: { days: -5 } })
      ).rejects.toThrow("between 1 and 365");
    });

    test("rejects invalid days filter - too large", async () => {
      await expect(
        service.search("test", { filters: { days: 400 } })
      ).rejects.toThrow("between 1 and 365");
    });

    test("accepts valid days filter", async () => {
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      // Should not throw
      await service.search("test", { filters: { days: 30 } });
    });

    test("rejects invalid limit - zero", async () => {
      await expect(service.search("test", { limit: 0 })).rejects.toThrow(
        "between 1 and"
      );
    });

    test("rejects invalid limit - too large", async () => {
      await expect(service.search("test", { limit: 200 })).rejects.toThrow(
        "between 1 and"
      );
    });

    test("accepts valid limit", async () => {
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      // Should not throw
      await service.search("test", { limit: 50 });
    });

    test("rejects predicate filter exceeding max length", async () => {
      const longPredicate = "a".repeat(101);
      await expect(
        service.search("test", { filters: { predicate: longPredicate } })
      ).rejects.toThrow("at most 100 characters");
    });
  });

  describe("rate limiting", () => {
    test("allows requests within limit", async () => {
      (mockDb.query as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve([[]])
      );

      // Should not throw for reasonable number of requests
      for (let i = 0; i < 5; i++) {
        await service.search("test query");
      }
    });

    test("throws when rate limit exceeded", async () => {
      (mockDb.query as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve([[]])
      );

      // Exhaust rate limit
      for (let i = 0; i < 30; i++) {
        await service.search("test query");
      }

      // Next request should fail
      await expect(service.search("test query")).rejects.toThrow(
        "Rate limit exceeded"
      );
    });

    test("rate limit resets after window", async () => {
      // This is tested via resetRateLimit() helper
      (mockDb.query as ReturnType<typeof mock>).mockImplementation(() =>
        Promise.resolve([[]])
      );

      // Exhaust rate limit
      for (let i = 0; i < 30; i++) {
        await service.search("test query");
      }

      // Reset rate limit
      service.resetRateLimit();

      // Should work again
      await service.search("test query");
    });
  });

  describe("error handling", () => {
    test("handles embedding service failure", async () => {
      (mockEmbeddingService.embed as ReturnType<typeof mock>).mockImplementationOnce(
        () => Promise.reject(new Error("Embedding API error"))
      );

      await expect(service.search("test query")).rejects.toThrow(
        "Embedding API error"
      );
    });

    test("handles database query failure", async () => {
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.reject(new Error("Database error"))
      );

      await expect(service.search("test query")).rejects.toThrow(
        "Database error"
      );
    });

    test("handles empty database results gracefully", async () => {
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([[]])
      );

      const results = await service.search("test query");

      expect(results).toEqual([]);
    });

    test("handles null database results gracefully", async () => {
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([null as unknown as unknown[]])
      );

      const results = await service.search("test query");

      expect(results).toEqual([]);
    });
  });

  describe("searchExpanded", () => {
    test("delegates to search for now", async () => {
      const mockResults = [
        {
          id: "claim:1",
          subject: "Rust",
          predicate: "is-safer-than",
          object: "C++",
          confidence: 0.9,
          extracted_at: new Date(),
          similarity: 0.9,
        },
      ];
      (mockDb.query as ReturnType<typeof mock>).mockImplementationOnce(() =>
        Promise.resolve([mockResults])
      );

      const results = await service.searchExpanded("memory safety");

      expect(results).toHaveLength(1);
      expect(mockEmbeddingService.embed).toHaveBeenCalled();
    });
  });
});
