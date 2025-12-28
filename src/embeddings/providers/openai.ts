/**
 * OpenAI embedding provider using text-embedding-3-small or similar models
 */

import type { EmbeddingProvider } from "../types";
import { withRetry } from "../../utils/retry";

export interface OpenAIProviderConfig {
  model: string;
  dimensions: number;
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  name = "openai";
  dimensions: number;
  private apiKey: string;
  private model: string;

  constructor(config: OpenAIProviderConfig) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY environment variable is required for OpenAI embeddings. " +
          "Set it in your .env file or use the ollama provider instead."
      );
    }
    this.apiKey = apiKey;
    this.model = config.model;
    this.dimensions = config.dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return withRetry(
      async () => {
        const response = await fetch("https://api.openai.com/v1/embeddings", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.model,
            input: texts,
            dimensions: this.dimensions,
          }),
        });

        // Handle rate limiting with specific error
        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after");
          throw new Error(
            `rate_limit: OpenAI rate limited. Retry after: ${retryAfter || "unknown"}s`
          );
        }

        // Handle other errors
        if (!response.ok) {
          const errorBody = await response.text().catch(() => "Unknown error");
          throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
        }

        const data = (await response.json()) as {
          data: Array<{ index: number; embedding: number[] }>;
        };

        return data.data
          .sort((a, b) => a.index - b.index)
          .map((item) => item.embedding);
      },
      {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        retryableErrors: ["rate_limit", "429", "500", "502", "503"],
      }
    );
  }
}
