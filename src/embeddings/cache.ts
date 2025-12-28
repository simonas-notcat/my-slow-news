/**
 * LRU (Least Recently Used) cache for embeddings.
 * Uses Map's insertion order property combined with re-insertion on access
 * to maintain LRU ordering.
 */

import { createHash } from "crypto";

export class EmbeddingCache {
  private cache: Map<string, number[]> = new Map();
  private maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  private hash(text: string): string {
    return createHash("sha256").update(text).digest("hex").slice(0, 16);
  }

  async get(text: string): Promise<number[] | null> {
    const key = this.hash(text);
    const value = this.cache.get(key);

    if (value !== undefined) {
      // Move to end (most recently used) by re-inserting
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }

    return null;
  }

  async set(text: string, embedding: number[]): Promise<void> {
    const key = this.hash(text);

    // If key exists, delete first to update insertion order
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict least recently used (first item) if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, embedding);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
