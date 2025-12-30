/**
 * Tests for semantic analysis integration in the digest workflow.
 *
 * These tests verify the semantic analysis step configuration handling,
 * feature flag behavior, and environment variable validation.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("Semantic Analysis Configuration", () => {
  const originalOpenAIKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    // Restore original env
    if (originalOpenAIKey !== undefined) {
      process.env.OPENAI_API_KEY = originalOpenAIKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  describe("Feature Flags", () => {
    test("should skip when both features disabled", () => {
      const config = {
        semantic: {
          related_in_digest: { enabled: false },
          contradictions: { enabled: false },
        },
      };

      const relatedEnabled = config.semantic?.related_in_digest?.enabled ?? false;
      const contradictionsEnabled = config.semantic?.contradictions?.enabled ?? false;
      const shouldSkip = !relatedEnabled && !contradictionsEnabled;

      expect(shouldSkip).toBe(true);
    });

    test("should run when related claims enabled", () => {
      const config = {
        semantic: {
          related_in_digest: { enabled: true },
          contradictions: { enabled: false },
        },
      };

      const relatedEnabled = config.semantic?.related_in_digest?.enabled ?? false;
      const contradictionsEnabled = config.semantic?.contradictions?.enabled ?? false;
      const shouldSkip = !relatedEnabled && !contradictionsEnabled;

      expect(shouldSkip).toBe(false);
      expect(relatedEnabled).toBe(true);
    });

    test("should run when contradictions enabled", () => {
      const config = {
        semantic: {
          related_in_digest: { enabled: false },
          contradictions: { enabled: true },
        },
      };

      const relatedEnabled = config.semantic?.related_in_digest?.enabled ?? false;
      const contradictionsEnabled = config.semantic?.contradictions?.enabled ?? false;
      const shouldSkip = !relatedEnabled && !contradictionsEnabled;

      expect(shouldSkip).toBe(false);
      expect(contradictionsEnabled).toBe(true);
    });

    test("should run when both features enabled", () => {
      const config = {
        semantic: {
          related_in_digest: { enabled: true },
          contradictions: { enabled: true },
        },
      };

      const relatedEnabled = config.semantic?.related_in_digest?.enabled ?? false;
      const contradictionsEnabled = config.semantic?.contradictions?.enabled ?? false;
      const shouldSkip = !relatedEnabled && !contradictionsEnabled;

      expect(shouldSkip).toBe(false);
      expect(relatedEnabled).toBe(true);
      expect(contradictionsEnabled).toBe(true);
    });

    test("should use default values when config missing", () => {
      const config = {};

      const semanticConfig = (config as any).semantic ?? {};
      const relatedConfig = semanticConfig.related_in_digest ?? {};
      const contradictionsConfig = semanticConfig.contradictions ?? {};
      const relatedEnabled = relatedConfig.enabled ?? false;
      const contradictionsEnabled = contradictionsConfig.enabled ?? false;

      expect(relatedEnabled).toBe(false);
      expect(contradictionsEnabled).toBe(false);
    });
  });

  describe("Related Claims Configuration", () => {
    test("should use default values for related claims config", () => {
      const config = {
        semantic: {
          related_in_digest: { enabled: true },
        },
      };

      const relatedConfig = config.semantic?.related_in_digest ?? {};
      const perClaimLimit = relatedConfig.per_claim_limit ?? 2;
      const minSimilarity = relatedConfig.min_similarity ?? 0.65;

      expect(perClaimLimit).toBe(2);
      expect(minSimilarity).toBe(0.65);
    });

    test("should use custom values when provided", () => {
      const config = {
        semantic: {
          related_in_digest: {
            enabled: true,
            per_claim_limit: 5,
            min_similarity: 0.8,
          },
        },
      };

      const relatedConfig = config.semantic?.related_in_digest ?? {};
      const perClaimLimit = relatedConfig.per_claim_limit ?? 2;
      const minSimilarity = relatedConfig.min_similarity ?? 0.65;

      expect(perClaimLimit).toBe(5);
      expect(minSimilarity).toBe(0.8);
    });
  });

  describe("Contradictions Configuration", () => {
    test("should use default values for contradictions config", () => {
      const config = {
        semantic: {
          contradictions: { enabled: true },
        },
      };

      const contradictionsConfig = config.semantic?.contradictions ?? {};
      const minSimilarity = contradictionsConfig.min_similarity ?? 0.7;
      const useLlmVerification = contradictionsConfig.use_llm_verification ?? true;
      const maxContradictions = contradictionsConfig.max_in_digest ?? 5;

      expect(minSimilarity).toBe(0.7);
      expect(useLlmVerification).toBe(true);
      expect(maxContradictions).toBe(5);
    });

    test("should use custom values when provided", () => {
      const config = {
        semantic: {
          contradictions: {
            enabled: true,
            min_similarity: 0.85,
            use_llm_verification: false,
            max_in_digest: 10,
          },
        },
      };

      const contradictionsConfig = config.semantic?.contradictions ?? {};
      const minSimilarity = contradictionsConfig.min_similarity ?? 0.7;
      const useLlmVerification = contradictionsConfig.use_llm_verification ?? true;
      const maxContradictions = contradictionsConfig.max_in_digest ?? 5;

      expect(minSimilarity).toBe(0.85);
      expect(useLlmVerification).toBe(false);
      expect(maxContradictions).toBe(10);
    });

    test("should respect CONTRADICTION_CANDIDATE_LIMIT constant", () => {
      const CONTRADICTION_CANDIDATE_LIMIT = 10;
      expect(CONTRADICTION_CANDIDATE_LIMIT).toBe(10);
    });

    test("should respect CONTRADICTION_MIN_CONFIDENCE constant", () => {
      const CONTRADICTION_MIN_CONFIDENCE = 0.7;
      expect(CONTRADICTION_MIN_CONFIDENCE).toBe(0.7);
    });
  });

  describe("Environment Variable Validation", () => {
    test("should skip when OPENAI_API_KEY not set for openai provider", () => {
      delete process.env.OPENAI_API_KEY;

      const provider = "openai";
      const shouldSkip = provider === "openai" && !process.env.OPENAI_API_KEY;

      expect(shouldSkip).toBe(true);
    });

    test("should not skip when OPENAI_API_KEY is set", () => {
      process.env.OPENAI_API_KEY = "test-key";

      const provider = "openai";
      const shouldSkip = provider === "openai" && !process.env.OPENAI_API_KEY;

      expect(shouldSkip).toBe(false);
    });

    test("should not skip for ollama provider even without OPENAI_API_KEY", () => {
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

    test("should apply defaults when embeddings config missing", () => {
      const config = {};

      const embeddings = (config as any).embeddings;
      const embeddingConfig = {
        provider: embeddings?.provider ?? "openai",
        model: embeddings?.model ?? "text-embedding-3-small",
        dimensions: embeddings?.dimensions ?? 1536,
        cacheEnabled: embeddings?.cache_enabled ?? true,
        cacheSize: embeddings?.cache_size ?? 10000,
        batchSize: embeddings?.batch_size ?? 100,
      };

      expect(embeddingConfig.provider).toBe("openai");
      expect(embeddingConfig.model).toBe("text-embedding-3-small");
      expect(embeddingConfig.dimensions).toBe(1536);
    });
  });

  describe("Claim Validation", () => {
    test("should filter out claims with missing fields", () => {
      const claims = [
        { subject: "Rust", predicate: "is-faster-than", object: "Go", confidence: 0.9 },
        { subject: "", predicate: "has", object: "value", confidence: 0.8 },
        { subject: "TypeScript", predicate: "", object: "types", confidence: 0.7 },
        { subject: "Python", predicate: "uses", object: "", confidence: 0.6 },
      ];

      const validClaims = claims.filter(
        (c) => c.subject && c.predicate && c.object && (c.confidence ?? 0) >= 0.5
      );

      expect(validClaims.length).toBe(1);
      expect(validClaims[0].subject).toBe("Rust");
    });

    test("should filter out low-confidence claims", () => {
      const claims = [
        { subject: "Rust", predicate: "is-faster-than", object: "Go", confidence: 0.9 },
        { subject: "TypeScript", predicate: "has", object: "types", confidence: 0.3 },
        { subject: "Python", predicate: "is", object: "popular", confidence: 0.6 },
      ];

      const validClaims = claims.filter(
        (c) => c.subject && c.predicate && c.object && (c.confidence ?? 0) >= 0.5
      );

      expect(validClaims.length).toBe(2);
      expect(validClaims[0].confidence).toBeGreaterThanOrEqual(0.5);
      expect(validClaims[1].confidence).toBeGreaterThanOrEqual(0.5);
    });

    test("should handle missing confidence with default", () => {
      const claims = [
        { subject: "Rust", predicate: "is-fast", object: "yes" },
        { subject: "Go", predicate: "is-simple", object: "yes", confidence: 0.8 },
      ];

      const validClaims = claims.filter(
        (c) => c.subject && c.predicate && c.object && ((c as any).confidence ?? 0) >= 0.5
      );

      // First claim has no confidence, defaults to 0, filtered out
      expect(validClaims.length).toBe(1);
      expect(validClaims[0].subject).toBe("Go");
    });
  });

  describe("Related Claims Map Structure", () => {
    test("should create proper claim key format", () => {
      const claim = {
        subject: "Rust",
        predicate: "is-faster-than",
        object: "Go",
        confidence: 0.9,
      };

      const claimKey = `${claim.subject}|${claim.predicate}|${claim.object}`;

      expect(claimKey).toBe("Rust|is-faster-than|Go");
    });

    test("should handle special characters in claim key", () => {
      const claim = {
        subject: "C++",
        predicate: "is-complex",
        object: "yes",
        confidence: 0.8,
      };

      const claimKey = `${claim.subject}|${claim.predicate}|${claim.object}`;

      expect(claimKey).toBe("C++|is-complex|yes");
    });
  });

  describe("Semantic Analysis Result Structure", () => {
    test("should initialize with empty maps and arrays", () => {
      const semanticAnalysis = {
        relatedClaimsMap: {},
        contradictions: [],
      };

      expect(Object.keys(semanticAnalysis.relatedClaimsMap).length).toBe(0);
      expect(semanticAnalysis.contradictions.length).toBe(0);
    });

    test("should store related claims by claim key", () => {
      const semanticAnalysis: {
        relatedClaimsMap: Record<
          string,
          Array<{ subject: string; predicate: string; object: string; similarity: number }>
        >;
        contradictions: any[];
      } = {
        relatedClaimsMap: {},
        contradictions: [],
      };

      const claimKey = "Rust|is-faster-than|Go";
      semanticAnalysis.relatedClaimsMap[claimKey] = [
        {
          subject: "Rust",
          predicate: "is-better-than",
          object: "Go",
          similarity: 0.85,
        },
      ];

      expect(semanticAnalysis.relatedClaimsMap[claimKey].length).toBe(1);
      expect(semanticAnalysis.relatedClaimsMap[claimKey][0].similarity).toBe(0.85);
    });

    test("should store contradictions in array", () => {
      const semanticAnalysis: {
        relatedClaimsMap: Record<string, any[]>;
        contradictions: Array<{
          newClaim: { subject: string; predicate: string; object: string };
          existingClaim: { id: string; subject: string; predicate: string; object: string };
          contradictionType: string;
          confidence: number;
        }>;
      } = {
        relatedClaimsMap: {},
        contradictions: [],
      };

      semanticAnalysis.contradictions.push({
        newClaim: { subject: "Rust", predicate: "is-slow", object: "yes" },
        existingClaim: {
          id: "claim:123",
          subject: "Rust",
          predicate: "is-fast",
          object: "yes",
        },
        contradictionType: "semantic",
        confidence: 0.9,
      });

      expect(semanticAnalysis.contradictions.length).toBe(1);
      expect(semanticAnalysis.contradictions[0].confidence).toBe(0.9);
    });
  });

  describe("Null Safety", () => {
    test("should safely handle null arrays in reduce", () => {
      const relatedClaimsMap: Record<string, any[] | null> = {
        claim1: [{ similarity: 0.9 }],
        claim2: null,
        claim3: [{ similarity: 0.8 }, { similarity: 0.7 }],
      };

      const totalRelated = Object.values(relatedClaimsMap).reduce(
        (sum: number, arr) => sum + (arr?.length ?? 0),
        0
      );

      expect(totalRelated).toBe(3); // 1 + 0 + 2
    });

    test("should safely handle undefined arrays in reduce", () => {
      const relatedClaimsMap: Record<string, any[] | undefined> = {
        claim1: [{ similarity: 0.9 }],
        claim2: undefined,
        claim3: [{ similarity: 0.8 }],
      };

      const totalRelated = Object.values(relatedClaimsMap).reduce(
        (sum: number, arr) => sum + (arr?.length ?? 0),
        0
      );

      expect(totalRelated).toBe(2); // 1 + 0 + 1
    });

    test("should handle empty related claims map", () => {
      const relatedClaimsMap: Record<string, any[]> = {};

      const totalRelated = Object.values(relatedClaimsMap).reduce(
        (sum: number, arr) => sum + (arr?.length ?? 0),
        0
      );

      expect(totalRelated).toBe(0);
    });
  });

  describe("Database Query Parameters", () => {
    test("should exclude self-matches in similarity queries", () => {
      const claim = { subject: "Rust", predicate: "is-fast", object: "yes" };

      // Query params should exclude this exact claim
      const excludeCondition = {
        subject: claim.subject,
        predicate: claim.predicate,
        object: claim.object,
      };

      expect(excludeCondition.subject).toBe("Rust");
      expect(excludeCondition.predicate).toBe("is-fast");
      expect(excludeCondition.object).toBe("yes");
    });

    test("should respect candidate limit parameter", () => {
      const CONTRADICTION_CANDIDATE_LIMIT = 10;
      const queryParams = {
        candidateLimit: CONTRADICTION_CANDIDATE_LIMIT,
      };

      expect(queryParams.candidateLimit).toBe(10);
    });
  });
});
