import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { OpenAIEmbeddingProvider } from "./openai";

describe("OpenAIEmbeddingProvider", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env.OPENAI_API_KEY;
  let mockFetch: ReturnType<typeof mock>;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-api-key";
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
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalEnv) {
      process.env.OPENAI_API_KEY = originalEnv;
    } else {
      delete process.env.OPENAI_API_KEY;
    }
  });

  test("throws when OPENAI_API_KEY is not set", () => {
    delete process.env.OPENAI_API_KEY;
    expect(
      () =>
        new OpenAIEmbeddingProvider({
          model: "text-embedding-3-small",
          dimensions: 1536,
        })
    ).toThrow("OPENAI_API_KEY environment variable is required");
  });

  test("initializes with correct properties", () => {
    const provider = new OpenAIEmbeddingProvider({
      model: "text-embedding-3-small",
      dimensions: 1536,
    });

    expect(provider.name).toBe("openai");
    expect(provider.dimensions).toBe(1536);
  });

  test("embed() calls API with correct parameters", async () => {
    const provider = new OpenAIEmbeddingProvider({
      model: "text-embedding-3-small",
      dimensions: 1536,
    });

    const result = await provider.embed("test text");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/embeddings");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      Authorization: "Bearer test-api-key",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(options.body as string);
    expect(body.model).toBe("text-embedding-3-small");
    expect(body.input).toEqual(["test text"]);
    expect(body.dimensions).toBe(1536);

    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  test("embedBatch() handles multiple texts", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              { index: 1, embedding: [0.4, 0.5, 0.6] },
              { index: 0, embedding: [0.1, 0.2, 0.3] },
            ],
          })
        )
      )
    );

    const provider = new OpenAIEmbeddingProvider({
      model: "text-embedding-3-small",
      dimensions: 1536,
    });

    const results = await provider.embedBatch(["text1", "text2"]);

    expect(results).toHaveLength(2);
    // Results should be sorted by index
    expect(results[0]).toEqual([0.1, 0.2, 0.3]);
    expect(results[1]).toEqual([0.4, 0.5, 0.6]);
  });

  test("handles rate limiting with retry", async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          new Response("Rate limited", {
            status: 429,
            headers: { "retry-after": "1" },
          })
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
          })
        )
      );
    });

    const provider = new OpenAIEmbeddingProvider({
      model: "text-embedding-3-small",
      dimensions: 1536,
    });

    const result = await provider.embed("test");
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(callCount).toBe(2);
  });

  test("throws on non-retryable errors", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve(
        new Response("Bad request", {
          status: 400,
        })
      )
    );

    const provider = new OpenAIEmbeddingProvider({
      model: "text-embedding-3-small",
      dimensions: 1536,
    });

    await expect(provider.embed("test")).rejects.toThrow(
      "OpenAI API error 400"
    );
  });
});
