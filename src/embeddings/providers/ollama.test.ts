import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaEmbeddingProvider } from "./ollama";

describe("OllamaEmbeddingProvider", () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            embedding: [0.1, 0.2, 0.3],
          })
        )
      )
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("initializes with correct properties", () => {
    const provider = new OllamaEmbeddingProvider({
      baseUrl: "http://localhost:11434",
      model: "nomic-embed-text",
      dimensions: 768,
    });

    expect(provider.name).toBe("ollama");
    expect(provider.dimensions).toBe(768);
  });

  test("embed() calls API with correct parameters", async () => {
    const provider = new OllamaEmbeddingProvider({
      baseUrl: "http://localhost:11434",
      model: "nomic-embed-text",
      dimensions: 768,
    });

    const result = await provider.embed("test text");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:11434/api/embeddings");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "Content-Type": "application/json" });

    const body = JSON.parse(options.body as string);
    expect(body.model).toBe("nomic-embed-text");
    expect(body.prompt).toBe("test text");

    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  test("embedBatch() processes texts in parallel with concurrency limit", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            embedding: [callCount * 0.1, callCount * 0.2, callCount * 0.3],
          })
        )
      );
    });

    const provider = new OllamaEmbeddingProvider({
      baseUrl: "http://localhost:11434",
      model: "nomic-embed-text",
      dimensions: 768,
      concurrencyLimit: 2,
    });

    const results = await provider.embedBatch(["text1", "text2", "text3"]);

    expect(results).toHaveLength(3);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test("handles API errors", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response("Model not found", {
          status: 404,
        })
      )
    );

    const provider = new OllamaEmbeddingProvider({
      baseUrl: "http://localhost:11434",
      model: "nonexistent-model",
      dimensions: 768,
    });

    await expect(provider.embed("test")).rejects.toThrow(
      "Ollama API error 404"
    );
  });

  test("uses custom base URL", async () => {
    const provider = new OllamaEmbeddingProvider({
      baseUrl: "http://custom-host:8080",
      model: "nomic-embed-text",
      dimensions: 768,
    });

    await provider.embed("test");

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://custom-host:8080/api/embeddings");
  });
});
