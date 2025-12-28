/**
 * Embedding types and interfaces for semantic features
 */

/**
 * Interface for embedding providers (OpenAI, Ollama, etc.)
 */
export interface EmbeddingProvider {
  /** Provider name (e.g., 'openai', 'ollama') */
  name: string;

  /** Number of dimensions in the embedding vectors */
  dimensions: number;

  /** Embed a single text string */
  embed(text: string): Promise<number[]>;

  /** Embed multiple texts in a batch */
  embedBatch(texts: string[]): Promise<number[][]>;
}

/**
 * Configuration for the embedding service.
 *
 * Note: YAML config uses snake_case (e.g., cache_enabled) which is
 * converted to camelCase in TypeScript for consistency with JS conventions.
 */
export interface EmbeddingConfig {
  provider: "openai" | "ollama";
  model: string;
  /**
   * Number of dimensions in embedding vectors.
   * OpenAI text-embedding-3-small supports: 512, 1536 (default), 3072
   * Ollama nomic-embed-text uses 768 dimensions.
   */
  dimensions: number;
  cacheEnabled: boolean;
  /** Maximum number of embeddings to cache in memory */
  cacheSize?: number;
  batchSize: number;
}

/**
 * Result of an embedding operation
 */
export interface EmbeddingResult {
  text: string;
  embedding: number[];
  model: string;
  cached: boolean;
}

/**
 * OpenAI-specific configuration
 */
export interface OpenAIConfig {
  apiKeyEnv: string;
}

/**
 * Ollama-specific configuration
 */
export interface OllamaConfig {
  baseUrl: string;
  model: string;
}
