import {
  describe,
  test,
  expect,
  mock,
  beforeEach,
  afterEach,
} from "bun:test";
import {
  EmbeddingService,
  getEmbeddingService,
  resetEmbeddingService,
} from "./index";
import type { EmbeddingConfig } from "./types";

describe("EmbeddingService", () => {
  const originalFetch = globalThis.fetch;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  const originalOllamaUrl = process.env.OLLAMA_BASE_URL;
  let mockFetch: ReturnType<typeof mock>;

  const openaiConfig: EmbeddingConfig = {
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: 1536,
    cacheEnabled: true,
    batchSize: 10,
  };

  const ollamaConfig: EmbeddingConfig = {
    provider: "ollama",
    model: "nomic-embed-text",
    dimensions: 768,
    cacheEnabled: true,
    batchSize: 10,
  };

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-api-key";
    process.env.OLLAMA_BASE_URL = "http://localhost:11434";
    mockFetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
          })
        )
      )
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    resetEmbeddingService();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalOpenAIKey) {
      process.env.OPENAI_API_KEY = originalOpenAIKey;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
    if (originalOllamaUrl) {
      process.env.OLLAMA_BASE_URL = originalOllamaUrl;
    } else {
      delete process.env.OLLAMA_BASE_URL;
    }
    resetEmbeddingService();
  });

  describe("constructor", () => {
    test("creates service with OpenAI provider", () => {
      const service = new EmbeddingService(openaiConfig);
      expect(service.name).toBe("openai");
      expect(service.dimensions).toBe(1536);
    });

    test("creates service with Ollama provider", () => {
      // Mock Ollama response format
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              embedding: [0.1, 0.2, 0.3],
            })
          )
        )
      );

      const service = new EmbeddingService(ollamaConfig);
      expect(service.name).toBe("ollama");
      expect(service.dimensions).toBe(768);
    });

    test("throws for unknown provider", () => {
      expect(
        () =>
          new EmbeddingService({
            ...openaiConfig,
            provider: "unknown" as "openai",
          })
      ).toThrow("Unknown embedding provider");
    });
  });

  describe("embed()", () => {
    test("returns embedding result", async () => {
      const service = new EmbeddingService(openaiConfig);
      const result = await service.embed("test text");

      expect(result.text).toBe("test text");
      expect(result.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(result.model).toBe("openai");
      expect(result.cached).toBe(false);
    });

    test("uses cache on second call", async () => {
      const service = new EmbeddingService(openaiConfig);

      // First call
      const result1 = await service.embed("test text");
      expect(result1.cached).toBe(false);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should be cached
      const result2 = await service.embed("test text");
      expect(result2.cached).toBe(true);
      expect(result2.embedding).toEqual([0.1, 0.2, 0.3]);
      expect(mockFetch).toHaveBeenCalledTimes(1); // No additional API call
    });

    test("does not cache when disabled", async () => {
      const service = new EmbeddingService({
        ...openaiConfig,
        cacheEnabled: false,
      });

      await service.embed("test text");
      await service.embed("test text");

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("embedBatch()", () => {
    test("returns results for all texts", async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [
                { index: 0, embedding: [0.1, 0.2] },
                { index: 1, embedding: [0.3, 0.4] },
              ],
            })
          )
        )
      );

      const service = new EmbeddingService(openaiConfig);
      const results = await service.embedBatch(["text1", "text2"]);

      expect(results).toHaveLength(2);
      expect(results[0].text).toBe("text1");
      expect(results[0].embedding).toEqual([0.1, 0.2]);
      expect(results[1].text).toBe("text2");
      expect(results[1].embedding).toEqual([0.3, 0.4]);
    });

    test("uses cache for previously embedded texts", async () => {
      const service = new EmbeddingService(openaiConfig);

      // First embed one text
      await service.embed("text1");

      // Then batch embed including the cached text
      mockFetch.mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ index: 0, embedding: [0.5, 0.6] }],
            })
          )
        )
      );

      const results = await service.embedBatch(["text1", "text2"]);

      expect(results[0].cached).toBe(true);
      expect(results[0].embedding).toEqual([0.1, 0.2, 0.3]); // From cache
      expect(results[1].cached).toBe(false);
      expect(results[1].embedding).toEqual([0.5, 0.6]); // From API
    });

    test("respects batch size", async () => {
      const service = new EmbeddingService({
        ...openaiConfig,
        batchSize: 2,
      });

      let callCount = 0;
      mockFetch.mockImplementation(() => {
        callCount++;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data:
                callCount === 1
                  ? [
                      { index: 0, embedding: [0.1] },
                      { index: 1, embedding: [0.2] },
                    ]
                  : [{ index: 0, embedding: [0.3] }],
            })
          )
        );
      });

      const results = await service.embedBatch(["t1", "t2", "t3"]);

      expect(results).toHaveLength(3);
      expect(mockFetch).toHaveBeenCalledTimes(2); // Two batches
    });
  });

  describe("singleton", () => {
    test("getEmbeddingService returns same instance", () => {
      const service1 = getEmbeddingService(openaiConfig);
      const service2 = getEmbeddingService(openaiConfig);

      expect(service1).toBe(service2);
    });

    test("resetEmbeddingService clears singleton", () => {
      const service1 = getEmbeddingService(openaiConfig);
      resetEmbeddingService();
      const service2 = getEmbeddingService(openaiConfig);

      expect(service1).not.toBe(service2);
    });
  });
});
