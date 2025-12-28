import { describe, test, expect, beforeEach } from "bun:test";
import { EmbeddingCache } from "./cache";

describe("EmbeddingCache", () => {
  let cache: EmbeddingCache;

  beforeEach(() => {
    cache = new EmbeddingCache(5);
  });

  test("returns null for missing entries", async () => {
    const result = await cache.get("nonexistent");
    expect(result).toBeNull();
  });

  test("stores and retrieves embeddings", async () => {
    const embedding = [0.1, 0.2, 0.3];
    await cache.set("test text", embedding);

    const result = await cache.get("test text");
    expect(result).toEqual(embedding);
  });

  test("returns same value for same text (hash consistency)", async () => {
    const embedding = [0.1, 0.2, 0.3];
    await cache.set("hello world", embedding);

    const result = await cache.get("hello world");
    expect(result).toEqual(embedding);
  });

  test("evicts least recently used when at capacity", async () => {
    // Fill cache to capacity (5)
    for (let i = 0; i < 5; i++) {
      await cache.set(`text-${i}`, [i]);
    }
    expect(cache.size).toBe(5);

    // Add one more, should evict text-0
    await cache.set("text-5", [5]);
    expect(cache.size).toBe(5);

    // text-0 should be evicted
    expect(await cache.get("text-0")).toBeNull();

    // text-1 through text-5 should still be there
    expect(await cache.get("text-1")).toEqual([1]);
    expect(await cache.get("text-5")).toEqual([5]);
  });

  test("accessing entry moves it to most recently used", async () => {
    // Fill cache
    for (let i = 0; i < 5; i++) {
      await cache.set(`text-${i}`, [i]);
    }

    // Access text-0 to make it most recently used
    await cache.get("text-0");

    // Add two new entries
    await cache.set("text-5", [5]);
    await cache.set("text-6", [6]);

    // text-0 should still be there (was refreshed)
    expect(await cache.get("text-0")).toEqual([0]);

    // text-1 and text-2 should be evicted
    expect(await cache.get("text-1")).toBeNull();
    expect(await cache.get("text-2")).toBeNull();
  });

  test("updating existing key maintains capacity", async () => {
    for (let i = 0; i < 5; i++) {
      await cache.set(`text-${i}`, [i]);
    }

    // Update existing key
    await cache.set("text-2", [20]);
    expect(cache.size).toBe(5);

    // Value should be updated
    expect(await cache.get("text-2")).toEqual([20]);
  });

  test("clear removes all entries", async () => {
    await cache.set("text-1", [1]);
    await cache.set("text-2", [2]);
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(await cache.get("text-1")).toBeNull();
  });
});
