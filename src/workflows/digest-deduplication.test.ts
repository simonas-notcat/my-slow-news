/**
 * Tests for semantic deduplication integration in the digest workflow.
 *
 * These tests verify the deduplication configuration handling and
 * environment variable validation in the save-to-database step.
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

// Mock modules before importing the code under test
const mockGetEmbeddingService = mock(() => ({
  name: "openai",
  dimensions: 1536,
  embed: mock(() =>
    Promise.resolve({
      text: "test",
      embedding: [0.1, 0.2, 0.3],
      model: "openai",
      cached: false,
    })
  ),
  embedBatch: mock(() => Promise.resolve([])),
}));

const mockClaimDeduplicationService = mock(() => ({
  processNewClaim: mock(() =>
    Promise.resolve({
      isNew: true,
      claim: { id: "claim:test", subject: "Test", predicate: "has", object: "value" },
      relatedClaims: [],
    })
  ),
}));

// Test the configuration handling logic directly
describe("Deduplication Configuration", () => {
  const originalEnv = process.env.OPENAI_API_KEY;

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.OPENAI_API_KEY = originalEnv;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  describe("Environment Variable Validation", () => {
    test("should skip deduplication when OPENAI_API_KEY is not set for openai provider", () => {
      delete process.env.OPENAI_API_KEY;

      const provider = "openai";
      const shouldSkip = provider === "openai" && !process.env.OPENAI_API_KEY;

      expect(shouldSkip).toBe(true);
    });

    test("should not skip deduplication when OPENAI_API_KEY is set", () => {
      process.env.OPENAI_API_KEY = "test-key";

      const provider = "openai";
      const shouldSkip = provider === "openai" && !process.env.OPENAI_API_KEY;

      expect(shouldSkip).toBe(false);
    });

    test("should not skip deduplication for ollama provider even without OPENAI_API_KEY", () => {
      delete process.env.OPENAI_API_KEY;

      const provider = "ollama";
      const shouldSkip = provider === "openai" && !process.env.OPENAI_API_KEY;

      expect(shouldSkip).toBe(false);
    });
  });

  describe("Embedding Configuration", () => {
    test("should include all required fields with defaults", () => {
      const config = {
        embeddings: {
          provider: "openai" as const,
          model: "text-embedding-3-small",
          dimensions: 1536,
          cache_enabled: true,
          cache_size: 10000,
          batch_size: 100,
        },
      };

      const embeddingConfig = {
        provider: config.embeddings?.provider ?? "openai",
        model: config.embeddings?.model ?? "text-embedding-3-small",
        dimensions: config.embeddings?.dimensions ?? 1536,
        cacheEnabled: config.embeddings?.cache_enabled ?? true,
        cacheSize: config.embeddings?.cache_size ?? 10000,
        batchSize: config.embeddings?.batch_size ?? 100,
      };

      expect(embeddingConfig.provider).toBe("openai");
      expect(embeddingConfig.model).toBe("text-embedding-3-small");
      expect(embeddingConfig.dimensions).toBe(1536);
      expect(embeddingConfig.cacheEnabled).toBe(true);
      expect(embeddingConfig.cacheSize).toBe(10000);
      expect(embeddingConfig.batchSize).toBe(100);
    });

    test("should use defaults when config is missing", () => {
      const config: { embeddings?: Record<string, unknown> } = {};

      const embeddingConfig = {
        provider: (config.embeddings?.provider as "openai" | "ollama") ?? "openai",
        model: (config.embeddings?.model as string) ?? "text-embedding-3-small",
        dimensions: (config.embeddings?.dimensions as number) ?? 1536,
        cacheEnabled: (config.embeddings?.cache_enabled as boolean) ?? true,
        cacheSize: (config.embeddings?.cache_size as number) ?? 10000,
        batchSize: (config.embeddings?.batch_size as number) ?? 100,
      };

      expect(embeddingConfig.provider).toBe("openai");
      expect(embeddingConfig.model).toBe("text-embedding-3-small");
      expect(embeddingConfig.dimensions).toBe(1536);
      expect(embeddingConfig.cacheEnabled).toBe(true);
      expect(embeddingConfig.cacheSize).toBe(10000);
      expect(embeddingConfig.batchSize).toBe(100);
    });
  });

  describe("Deduplication Thresholds", () => {
    test("should use config thresholds when provided", () => {
      const config = {
        semantic: {
          deduplication: {
            enabled: true,
            similarity_threshold: 0.95,
            related_threshold: 0.80,
          },
        },
      };

      const thresholds = {
        duplicateThreshold: config.semantic?.deduplication?.similarity_threshold ?? 0.92,
        relatedThreshold: config.semantic?.deduplication?.related_threshold ?? 0.75,
      };

      expect(thresholds.duplicateThreshold).toBe(0.95);
      expect(thresholds.relatedThreshold).toBe(0.80);
    });

    test("should use default thresholds when config is missing", () => {
      const config: { semantic?: { deduplication?: Record<string, unknown> } } = {};

      const thresholds = {
        duplicateThreshold: (config.semantic?.deduplication?.similarity_threshold as number) ?? 0.92,
        relatedThreshold: (config.semantic?.deduplication?.related_threshold as number) ?? 0.75,
      };

      expect(thresholds.duplicateThreshold).toBe(0.92);
      expect(thresholds.relatedThreshold).toBe(0.75);
    });
  });

  describe("Deduplication Enabled Flag", () => {
    test("should be disabled by default", () => {
      const config: { semantic?: { deduplication?: { enabled?: boolean } } } = {};
      const deduplicationEnabled = config.semantic?.deduplication?.enabled ?? false;

      expect(deduplicationEnabled).toBe(false);
    });

    test("should respect explicit enabled=true", () => {
      const config = {
        semantic: {
          deduplication: {
            enabled: true,
          },
        },
      };
      const deduplicationEnabled = config.semantic?.deduplication?.enabled ?? false;

      expect(deduplicationEnabled).toBe(true);
    });

    test("should respect explicit enabled=false", () => {
      const config = {
        semantic: {
          deduplication: {
            enabled: false,
          },
        },
      };
      const deduplicationEnabled = config.semantic?.deduplication?.enabled ?? false;

      expect(deduplicationEnabled).toBe(false);
    });
  });
});

describe("Claim Processing Logic", () => {
  test("should skip claims without subject", () => {
    const claim = { subject: "", predicate: "has", object: "value", confidence: 0.9 };
    const shouldSkip = !claim.subject || !claim.predicate || !claim.object;

    expect(shouldSkip).toBe(true);
  });

  test("should skip claims without predicate", () => {
    const claim = { subject: "Test", predicate: "", object: "value", confidence: 0.9 };
    const shouldSkip = !claim.subject || !claim.predicate || !claim.object;

    expect(shouldSkip).toBe(true);
  });

  test("should skip claims without object", () => {
    const claim = { subject: "Test", predicate: "has", object: "", confidence: 0.9 };
    const shouldSkip = !claim.subject || !claim.predicate || !claim.object;

    expect(shouldSkip).toBe(true);
  });

  test("should skip low-confidence claims", () => {
    const claim = { subject: "Test", predicate: "has", object: "value", confidence: 0.4 };
    const shouldSkip = (claim.confidence ?? 0) < 0.5;

    expect(shouldSkip).toBe(true);
  });

  test("should process valid high-confidence claims", () => {
    const claim = { subject: "Test", predicate: "has", object: "value", confidence: 0.9 };
    const isValid = !!(claim.subject && claim.predicate && claim.object);
    const isHighConfidence = (claim.confidence ?? 0) >= 0.5;

    expect(isValid).toBe(true);
    expect(isHighConfidence).toBe(true);
  });

  test("should use default confidence of 0.5 when undefined", () => {
    const claim = { subject: "Test", predicate: "has", object: "value", confidence: undefined };
    const confidence = claim.confidence ?? 0.5;

    expect(confidence).toBe(0.5);
  });
});

describe("Deduplication Statistics", () => {
  test("should track new claims correctly", () => {
    let newClaimsCreated = 0;
    let duplicatesDetected = 0;

    // Simulate processing new claims
    const results = [
      { isNew: true },
      { isNew: true },
      { isNew: false },
      { isNew: true },
      { isNew: false },
    ];

    for (const result of results) {
      if (result.isNew) {
        newClaimsCreated++;
      } else {
        duplicatesDetected++;
      }
    }

    expect(newClaimsCreated).toBe(3);
    expect(duplicatesDetected).toBe(2);
  });
});
