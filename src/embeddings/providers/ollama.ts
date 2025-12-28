/**
 * Ollama embedding provider for local embedding models
 */

import type { EmbeddingProvider } from "../types";

export interface OllamaProviderConfig {
  baseUrl: string;
  model: string;
  dimensions: number;
  concurrencyLimit?: number;
}

/**
 * Concurrency limiter for parallel requests.
 * Pre-assigns indices to workers to avoid race conditions.
 */
async function withConcurrencyLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);

  // Pre-assign indices to each worker to avoid shared mutable state
  const chunks: number[][] = Array.from({ length: limit }, () => []);
  for (let i = 0; i < tasks.length; i++) {
    chunks[i % limit].push(i);
  }

  async function runWorker(indices: number[]): Promise<void> {
    for (const index of indices) {
      results[index] = await tasks[index]();
    }
  }

  // Start workers with their pre-assigned indices
  await Promise.all(chunks.map((indices) => runWorker(indices)));
  return results;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  name = "ollama";
  dimensions: number;
  private baseUrl: string;
  private model: string;
  private concurrencyLimit: number;

  constructor(config: OllamaProviderConfig) {
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.dimensions = config.dimensions;
    this.concurrencyLimit = config.concurrencyLimit ?? 4;
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(`Ollama API error ${response.status}: ${errorBody}`);
    }

    const data = (await response.json()) as { embedding: number[] };
    return data.embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama doesn't support batch API, but we can parallelize requests
    // with a concurrency limit to avoid overwhelming the server
    const tasks = texts.map((text) => () => this.embed(text));
    return withConcurrencyLimit(tasks, this.concurrencyLimit);
  }
}
