import { z } from "zod";

// Configuration schema
export const ConfigSchema = z.object({
  sources: z.object({
    reddit: z.object({
      subreddits: z.array(z.string()),
      posts_per_subreddit: z.number().default(5),
      lookback_hours: z.number().default(24),
      min_relative_score: z.number().default(1.0),
      max_comments_per_post: z.number().default(50),
    }),
  }),
  llm: z.object({
    provider: z.literal("anthropic"),
    model: z.string().default("anthropic/claude-sonnet-4-20250514"),
    daily_budget_usd: z.number().default(5.0),
  }),
  output: z.object({
    digest_dir: z.string().default("./digests"),
    format: z.literal("markdown"),
  }),
  database: z.object({
    url: z.string().default("ws://localhost:8666/rpc"),
    namespace: z.string().default("myslownews"),
    database: z.string().default("main"),
  }),
  // Summarization feature flags
  summarization: z.object({
    comment_selection: z.object({
      top_scored_weight: z.number().default(0.4),
      replied_to_weight: z.number().default(0.2),
      controversial_weight: z.number().default(0.2),
      contrarian_weight: z.number().default(0.2),
    }).optional().default({}),
    hierarchical: z.object({
      enabled: z.boolean().default(true),
      min_comments_threshold: z.number().default(20),
      max_threads: z.number().default(5),
    }).optional().default({}),
    controversy: z.object({
      enabled: z.boolean().default(true),
      use_cot: z.boolean().default(true),
      threshold: z.number().default(0.5),
    }).optional().default({}),
    theme_synthesis: z.object({
      enabled: z.boolean().default(true),
      min_posts: z.number().default(3),
    }).optional().default({}),
  }).optional().default({}),
  // Link fetching configuration
  link_fetching: z.object({
    enabled: z.boolean().default(true),
    timeout_ms: z.number().default(10000),
    max_content_length: z.number().default(5000),
    allowed_domains: z.array(z.string()).optional().default([]),
    blocked_domains: z.array(z.string()).optional().default([]),
  }).optional().default({}),
  // Embedding configuration for semantic features
  // Note: YAML uses snake_case, TypeScript uses camelCase (converted on load)
  embeddings: z.object({
    provider: z.enum(["openai", "ollama"]).default("openai"),
    model: z.string().default("text-embedding-3-small"),
    // OpenAI text-embedding-3-small supports: 512, 1536, 3072
    // Ollama nomic-embed-text uses 768 dimensions
    dimensions: z.number().default(1536),
    cache_enabled: z.boolean().default(true),
    cache_size: z.number().default(10000),
    batch_size: z.number().default(100),
    openai: z.object({
      api_key_env: z.string().default("OPENAI_API_KEY"),
    }).optional(),
    ollama: z.object({
      base_url: z.string().default("http://localhost:11434"),
      model: z.string().default("nomic-embed-text"),
    }).optional(),
  }).optional().default({}),
  // Digest generation configuration
  digest: z.object({
    format: z.enum(["markdown", "html"]).default("markdown"),
    // "What Matters" section configuration
    what_matters: z.object({
      max_topics: z.number().default(6),
      low_activity_percentile: z.number().default(10),  // Posts below this percentile are "low activity"
    }).optional().default({}),
    // Top discussions section
    top_discussions: z.object({
      max_posts: z.number().default(10),
      min_score: z.number().default(10),
      min_comments: z.number().default(5),
    }).optional().default({}),
    // Notable threads within discussions
    notable_threads: z.object({
      max_per_post: z.number().default(3),
      min_score: z.number().default(5),
    }).optional().default({}),
    // Claims display settings
    claims: z.object({
      min_confidence: z.number().default(0.8),
      max_per_post: z.number().default(3),
      show_verification_marks: z.boolean().default(true),
    }).optional().default({}),
  }).optional().default({}),
  // Semantic features configuration
  semantic: z.object({
    deduplication: z.object({
      // Default to false since OpenAI API key is required for default provider
      enabled: z.boolean().default(false),
      similarity_threshold: z.number().default(0.92),
      related_threshold: z.number().default(0.75),
    }).optional().default({}),
    // Natural language search configuration
    search: z.object({
      enabled: z.boolean().default(true),
      min_similarity: z.number().default(0.5),
      max_results: z.number().default(50),
      // Show similarity scores in results
      show_scores: z.boolean().default(true),
    }).optional().default({}),
    // Related claims discovery configuration
    related: z.object({
      enabled: z.boolean().default(true),
      // Number of related claims to show
      limit: z.number().default(6),
      // Minimum similarity to consider related
      min_similarity: z.number().default(0.6),
      // Group by relationship type
      group_by_relationship: z.boolean().default(false),
      // Pre-compute related claims on save
      precompute: z.boolean().default(false),
    }).optional().default({}),
    // Theme clustering configuration
    clustering: z.object({
      enabled: z.boolean().default(true),
      // Clustering algorithm: kmeans, dbscan, hierarchical
      algorithm: z.enum(["kmeans", "dbscan", "hierarchical"]).default("kmeans"),
      // Minimum cluster size to keep
      min_cluster_size: z.number().default(3),
      // K-means: number of clusters (0 = auto-detect based on claim count)
      num_clusters: z.number().default(0),
      // DBSCAN: epsilon distance threshold
      epsilon: z.number().default(0.3),
      // DBSCAN: minimum points per cluster
      min_points: z.number().default(3),
      // Hierarchical: linkage type
      linkage: z.enum(["single", "complete", "average"]).default("average"),
      // Hierarchical: distance threshold for merging
      distance_threshold: z.number().default(0.5),
      // How often to recompute themes (hours)
      recompute_interval_hours: z.number().default(24),
      // Use LLM for generating theme labels
      use_llm_labels: z.boolean().default(true),
    }).optional().default({}),
    // Contradiction detection configuration
    contradictions: z.object({
      // Enable contradiction detection in digest
      enabled: z.boolean().default(false),
      // Minimum similarity to consider for contradiction check
      min_similarity: z.number().default(0.7),
      // Use LLM for semantic contradiction verification
      use_llm_verification: z.boolean().default(true),
      // Maximum contradictions to show in digest
      max_in_digest: z.number().default(5),
    }).optional().default({}),
    // Related claims in digest configuration
    related_in_digest: z.object({
      // Enable related claims in digest output
      enabled: z.boolean().default(false),
      // Max related claims per new claim
      per_claim_limit: z.number().default(2),
      // Minimum similarity threshold
      min_similarity: z.number().default(0.65),
    }).optional().default({}),
  }).optional().default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

// Re-export Reddit types from sources
export type { RedditPost, RedditComment } from "../sources/types";

// Database record types
export interface PostRecord {
  id?: string;
  reddit_id: string;
  subreddit: string;
  title: string;
  content: string;
  author: string;
  url: string;
  score: number;
  created_at: Date;
  fetched_at: Date;
}

export interface CommentRecord {
  id?: string;
  reddit_id: string;
  post: string; // record<post>
  author: string;
  content: string;
  score: number;
  parent?: string; // record<comment>
}

export interface ClaimRecord {
  id?: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  extracted_at: Date;
  // Embedding fields for semantic features
  embedding?: number[];
  embedding_model?: string;
  embedded_at?: Date;
  // Deduplication fields
  canonical_claim?: string; // record<claim>
  is_canonical?: boolean;
}

export interface ClaimStancesRecord {
  id?: string;
  claim: string; // record<claim>
  content_author_stance: string;
  commenter_agree_pct: number;
  commenter_disagree_pct: number;
  commenter_camps?: Record<string, unknown>;
  user_stance?: string;
  user_note?: string;
}

export interface ClaimSimilarityRecord {
  id?: string;
  in: string; // record<claim> - source claim
  out: string; // record<claim> - target claim
  similarity: number;
  relationship: "duplicate" | "related" | "contradicts";
  detected_at: Date;
}

export interface DigestRecord {
  id?: string;
  date: Date;
  file_path: string;
  posts_included: string[]; // array<record<post>>
  claims_extracted: string[]; // array<record<claim>>
}

// Stance values
export type Stance = "agrees" | "disagrees" | "neutral" | "uncertain" | "not-stated";

// Extracted claim from LLM
export interface ExtractedClaim {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source_stance: Stance;
}

// Post summary from LLM
export interface PostSummary {
  title: string;
  summary: string;
  notable_comments: string[];
  claims: ExtractedClaim[];
}

// Query result types for type-safe database queries
export interface PredicateCount {
  predicate: string;
  count: number;
}

export interface SubjectCount {
  subject: string;
  count: number;
}

export interface ClaimWithStance extends ClaimRecord {
  claim?: ClaimRecord; // For FETCH queries
  user_stance?: string;
  user_note?: string;
}

export interface PredicateRecord {
  id?: string;
  name: string;
  description?: string;
  is_builtin: boolean;
  first_seen: Date;
  usage_count: number;
}
