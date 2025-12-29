import type Surreal from "surrealdb";
import type { ClaimRecord } from "../types";
import type { EmbeddingService } from "./index";

export interface SemanticSearchOptions {
  limit?: number;
  minSimilarity?: number;
  includeCanonicalOnly?: boolean;
  filters?: {
    predicate?: string;
    days?: number;
  };
}

export interface SemanticSearchResult {
  claim: ClaimRecord;
  similarity: number;
}

/** Input validation constraints */
const VALIDATION = {
  MIN_QUERY_LENGTH: 2,
  MAX_QUERY_LENGTH: 500,
  MAX_PREDICATE_LENGTH: 100,
  MAX_RESULTS_LIMIT: 100,
} as const;

/** Rate limiting: max requests per minute */
const RATE_LIMIT = {
  MAX_REQUESTS_PER_MINUTE: 30,
  WINDOW_MS: 60_000,
} as const;

export class SemanticSearchService {
  private requestTimestamps: number[] = [];

  constructor(
    private db: Surreal,
    private embeddings: EmbeddingService
  ) {}

  /**
   * Check rate limit before making API call.
   * Throws if rate limit exceeded.
   */
  private checkRateLimit(): void {
    const now = Date.now();
    // Remove timestamps outside the window
    this.requestTimestamps = this.requestTimestamps.filter(
      (ts) => now - ts < RATE_LIMIT.WINDOW_MS
    );

    if (this.requestTimestamps.length >= RATE_LIMIT.MAX_REQUESTS_PER_MINUTE) {
      const oldestTs = this.requestTimestamps[0];
      const waitMs = RATE_LIMIT.WINDOW_MS - (now - oldestTs);
      throw new Error(
        `Rate limit exceeded. Please wait ${Math.ceil(waitMs / 1000)}s before searching again.`
      );
    }

    this.requestTimestamps.push(now);
  }

  /**
   * Reset rate limit state (for testing).
   */
  resetRateLimit(): void {
    this.requestTimestamps = [];
  }

  /**
   * Validate search input.
   * Throws descriptive error if validation fails.
   */
  private validateInput(query: string, options: SemanticSearchOptions): void {
    // Validate query
    if (!query || query.trim().length < VALIDATION.MIN_QUERY_LENGTH) {
      throw new Error(
        `Search query must be at least ${VALIDATION.MIN_QUERY_LENGTH} characters`
      );
    }
    if (query.length > VALIDATION.MAX_QUERY_LENGTH) {
      throw new Error(
        `Search query must be at most ${VALIDATION.MAX_QUERY_LENGTH} characters`
      );
    }

    // Validate predicate filter
    if (options.filters?.predicate) {
      if (options.filters.predicate.length > VALIDATION.MAX_PREDICATE_LENGTH) {
        throw new Error(
          `Predicate filter must be at most ${VALIDATION.MAX_PREDICATE_LENGTH} characters`
        );
      }
    }

    // Validate limit
    if (options.limit !== undefined) {
      if (options.limit < 1 || options.limit > VALIDATION.MAX_RESULTS_LIMIT) {
        throw new Error(
          `Limit must be between 1 and ${VALIDATION.MAX_RESULTS_LIMIT}`
        );
      }
    }

    // Validate days filter
    if (options.filters?.days !== undefined) {
      if (options.filters.days < 1 || options.filters.days > 365) {
        throw new Error("Days filter must be between 1 and 365");
      }
    }
  }

  /**
   * Search claims semantically using natural language query.
   */
  async search(
    query: string,
    options: SemanticSearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    // Validate input before processing
    this.validateInput(query, options);

    // Check rate limit before making API calls
    this.checkRateLimit();

    const {
      limit = 20,
      minSimilarity = 0.5,
      includeCanonicalOnly = true,
      filters = {},
    } = options;

    // Embed the search query
    const { embedding } = await this.embeddings.embed(query.trim());

    // Build filter conditions
    const conditions: string[] = ["embedding IS NOT NONE"];
    const params: Record<string, unknown> = {
      embedding,
      limit,
      minSimilarity,
    };

    if (includeCanonicalOnly) {
      conditions.push("is_canonical = true");
    }

    if (filters.predicate) {
      conditions.push("predicate = $predicate");
      params.predicate = filters.predicate;
    }

    if (filters.days) {
      conditions.push("extracted_at >= $cutoff");
      params.cutoff = new Date(
        Date.now() - filters.days * 24 * 60 * 60 * 1000
      ).toISOString();
    }

    const whereClause = conditions.join(" AND ");

    // Perform vector similarity search
    const sqlQuery = `
      SELECT
        *,
        vector::similarity::cosine(embedding, $embedding) AS similarity
      FROM claim
      WHERE ${whereClause}
        AND vector::similarity::cosine(embedding, $embedding) >= $minSimilarity
      ORDER BY similarity DESC
      LIMIT $limit
    `;

    const results = await this.db.query<[Array<ClaimRecord & { similarity: number }>]>(
      sqlQuery,
      params
    );

    // Map results to SemanticSearchResult format
    return (results[0] || []).map((row) => ({
      claim: {
        id: row.id,
        subject: row.subject,
        predicate: row.predicate,
        object: row.object,
        confidence: row.confidence,
        extracted_at: row.extracted_at,
        embedding: row.embedding,
        embedding_model: row.embedding_model,
        embedded_at: row.embedded_at,
        canonical_claim: row.canonical_claim,
        is_canonical: row.is_canonical,
      },
      similarity: row.similarity,
    }));
  }

  /**
   * Search with query expansion - also searches for related concepts.
   * Uses the LLM to generate related terms for broader coverage.
   */
  async searchExpanded(
    query: string,
    options: SemanticSearchOptions = {}
  ): Promise<SemanticSearchResult[]> {
    // For now, just do a simple search
    // Future: Use LLM to expand query with related terms
    return this.search(query, options);
  }

  /**
   * Get search suggestions based on partial input.
   * Useful for autocomplete functionality.
   */
  async getSuggestions(partialQuery: string, limit: number = 5): Promise<string[]> {
    // Search for claims that match the partial query
    const results = await this.search(partialQuery, {
      limit,
      minSimilarity: 0.4,
    });

    // Extract unique subjects as suggestions
    const subjects = new Set<string>();
    for (const result of results) {
      subjects.add(result.claim.subject);
      if (subjects.size >= limit) break;
    }

    return Array.from(subjects);
  }
}
