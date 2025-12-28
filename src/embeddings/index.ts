/**
 * Main embedding service that orchestrates providers and caching
 */

import type {
  EmbeddingProvider,
  EmbeddingConfig,
  EmbeddingResult,
} from "./types";
import { OpenAIEmbeddingProvider } from "./providers/openai";
import { OllamaEmbeddingProvider } from "./providers/ollama";
import { EmbeddingCache } from "./cache";

export class EmbeddingService {
  private provider: EmbeddingProvider;
  private cache: EmbeddingCache | null;
  private batchSize: number;

  constructor(config: EmbeddingConfig) {
    this.provider = this.createProvider(config);
    this.cache = config.cacheEnabled ? new EmbeddingCache() : null;
    this.batchSize = config.batchSize;
  }

  private createProvider(config: EmbeddingConfig): EmbeddingProvider {
    switch (config.provider) {
      case "openai":
        return new OpenAIEmbeddingProvider({
          model: config.model,
          dimensions: config.dimensions,
        });
      case "ollama":
        return new OllamaEmbeddingProvider({
          baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
          model: config.model,
          dimensions: config.dimensions,
        });
      default:
        throw new Error(`Unknown embedding provider: ${config.provider}`);
    }
  }

  async embed(text: string): Promise<EmbeddingResult> {
    // Check cache first
    if (this.cache) {
      const cached = await this.cache.get(text);
      if (cached) {
        return {
          text,
          embedding: cached,
          model: this.provider.name,
          cached: true,
        };
      }
    }

    const embedding = await this.provider.embed(text);

    // Store in cache
    if (this.cache) {
      await this.cache.set(text, embedding);
    }

    return { text, embedding, model: this.provider.name, cached: false };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    // Pre-initialize results array to avoid sparse array issues
    const results: EmbeddingResult[] = new Array(texts.length);
    const uncached: { text: string; index: number }[] = [];

    // Check cache for each text
    for (let i = 0; i < texts.length; i++) {
      if (this.cache) {
        const cached = await this.cache.get(texts[i]);
        if (cached) {
          results[i] = {
            text: texts[i],
            embedding: cached,
            model: this.provider.name,
            cached: true,
          };
          continue;
        }
      }
      uncached.push({ text: texts[i], index: i });
    }

    // Embed uncached texts in batches
    for (let i = 0; i < uncached.length; i += this.batchSize) {
      const batch = uncached.slice(i, i + this.batchSize);
      const embeddings = await this.provider.embedBatch(
        batch.map((b) => b.text)
      );

      for (let j = 0; j < batch.length; j++) {
        const { text, index } = batch[j];
        const embedding = embeddings[j];

        results[index] = {
          text,
          embedding,
          model: this.provider.name,
          cached: false,
        };

        if (this.cache) {
          await this.cache.set(text, embedding);
        }
      }
    }

    return results;
  }

  /** Get the provider name (e.g., 'openai', 'ollama') */
  get name(): string {
    return this.provider.name;
  }

  get dimensions(): number {
    return this.provider.dimensions;
  }
}

// Singleton instance
let embeddingService: EmbeddingService | null = null;

export function getEmbeddingService(config: EmbeddingConfig): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService(config);
  }
  return embeddingService;
}

export function resetEmbeddingService(): void {
  embeddingService = null;
}

// Re-export types
export type { EmbeddingConfig, EmbeddingResult, EmbeddingProvider } from "./types";
