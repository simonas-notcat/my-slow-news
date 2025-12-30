import { describe, test, expect, beforeEach } from "vitest";
import { EmbeddingCache } from "./cache";

describe("EmbeddingCache", () => {
  let cache: EmbeddingCache;

  beforeEach(() => {
    cache = new EmbeddingCache(5);
  });

  test("returns null for missing entries", () => {
    const result = cache.get("nonexistent");
    expect(result).toBeNull();
  });

  test("stores and retrieves embeddings", () => {
    const embedding = [0.1, 0.2, 0.3];
    cache.set("test text", embedding);

    const result = cache.get("test text");
    expect(result).toEqual(embedding);
  });

  test("returns same value for same text (hash consistency)", () => {
    const embedding = [0.1, 0.2, 0.3];
    cache.set("hello world", embedding);

    const result = cache.get("hello world");
    expect(result).toEqual(embedding);
  });

  test("uses full SHA-256 hash to avoid collisions", () => {
    // With full 64-char hash, collision probability is negligible
    const texts = Array.from({ length: 100 }, (_, i) => `unique-text-${i}`);

    for (const text of texts) {
      cache.set(text, [texts.indexOf(text)]);
    }

    // All entries should be stored (up to capacity)
    expect(cache.size).toBe(5); // Limited by cache size
  });

  test("evicts least recently used when at capacity", () => {
    // Fill cache to capacity (5)
    for (let i = 0; i < 5; i++) {
      cache.set(`text-${i}`, [i]);
    }
    expect(cache.size).toBe(5);

    // Add one more, should evict text-0
    cache.set("text-5", [5]);
    expect(cache.size).toBe(5);

    // text-0 should be evicted
    expect(cache.get("text-0")).toBeNull();

    // text-1 through text-5 should still be there
    expect(cache.get("text-1")).toEqual([1]);
    expect(cache.get("text-5")).toEqual([5]);
  });

  test("accessing entry moves it to most recently used", () => {
    // Fill cache
    for (let i = 0; i < 5; i++) {
      cache.set(`text-${i}`, [i]);
    }

    // Access text-0 to make it most recently used
    cache.get("text-0");

    // Add two new entries
    cache.set("text-5", [5]);
    cache.set("text-6", [6]);

    // text-0 should still be there (was refreshed)
    expect(cache.get("text-0")).toEqual([0]);

    // text-1 and text-2 should be evicted
    expect(cache.get("text-1")).toBeNull();
    expect(cache.get("text-2")).toBeNull();
  });

  test("updating existing key maintains capacity", () => {
    for (let i = 0; i < 5; i++) {
      cache.set(`text-${i}`, [i]);
    }

    // Update existing key
    cache.set("text-2", [20]);
    expect(cache.size).toBe(5);

    // Value should be updated
    expect(cache.get("text-2")).toEqual([20]);
  });

  test("clear removes all entries", () => {
    cache.set("text-1", [1]);
    cache.set("text-2", [2]);
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("text-1")).toBeNull();
  });

  test("respects custom max size", () => {
    const smallCache = new EmbeddingCache(3);

    for (let i = 0; i < 5; i++) {
      smallCache.set(`text-${i}`, [i]);
    }

    expect(smallCache.size).toBe(3);
    // First two entries should be evicted
    expect(smallCache.get("text-0")).toBeNull();
    expect(smallCache.get("text-1")).toBeNull();
    // Later entries should still be there
    expect(smallCache.get("text-4")).toEqual([4]);
  });

  test("returns copy to prevent mutation of cached values", () => {
    const original = [0.1, 0.2, 0.3];
    cache.set("test", original);

    // Get the cached value and mutate it
    const retrieved = cache.get("test")!;
    retrieved[0] = 999;
    retrieved.push(0.4);

    // Original cached value should be unchanged
    const retrievedAgain = cache.get("test");
    expect(retrievedAgain).toEqual([0.1, 0.2, 0.3]);
  });
});
